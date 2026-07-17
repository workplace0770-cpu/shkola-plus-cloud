import { env } from "cloudflare:workers";
import { userFromRequest } from "../../../../db/accounts";
import { ensurePresenceTable } from "../../../../db/presence";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function POST(request: Request) {
  try {
    const currentUser = await userFromRequest(request);
    if (!currentUser) return json({ error: "Требуется авторизация" }, 401);

    await ensurePresenceTable();
    const lastSeenAt = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO user_presence (user_id, last_seen_at)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at
    `).bind(currentUser.id, lastSeenAt).run();

    return json({ ok: true, lastSeenAt });
  } catch {
    return json({ error: "Не удалось обновить активность" }, 503);
  }
}
