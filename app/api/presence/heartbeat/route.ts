import { env } from "cloudflare:workers";
import { userFromRequest } from "../../../../db/accounts";
import {
  PRESENCE_ALLOWED_ROLES,
  PRESENCE_WRITE_THROTTLE_MS,
} from "../../../../db/presence";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function POST(request: Request) {
  try {
    const currentUser = await userFromRequest(request);
    if (!currentUser) return json({ error: "Требуется авторизация" }, 401);
    if (!PRESENCE_ALLOWED_ROLES.has(currentUser.role)) {
      return json({ error: "Недостаточно прав" }, 403);
    }

    const lastSeenAt = new Date().toISOString();
    const updateAllowedBefore = new Date(
      Date.now() - PRESENCE_WRITE_THROTTLE_MS,
    ).toISOString();
    await env.DB.prepare(`
      INSERT INTO user_presence (user_id, last_seen_at)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at
      WHERE user_presence.last_seen_at<=?
    `).bind(currentUser.id, lastSeenAt, updateAllowedBefore).run();

    return json({ ok: true });
  } catch {
    return json({ error: "Не удалось обновить активность" }, 503);
  }
}
