import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../db/accounts";
import { ensureBackupExportsTable } from "../../../../db/backups";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function requireAdmin(request: Request) {
  await ensureAccountsTable();
  const user = await userFromRequest(request);
  if (!user) return { response: json({ error: "Требуется вход" }, 401), user: null };
  if (user.role !== "admin") return { response: json({ error: "Недостаточно прав" }, 403), user: null };
  return { response: null, user };
}

export async function GET(request: Request) {
  const checkedAt = new Date().toISOString();
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const startedAt = Date.now();
    await env.DB.prepare("SELECT 1 AS ok").first();
    const databaseLatencyMs = Date.now() - startedAt;

    await ensureBackupExportsTable();
    const [tables, users, backup] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM school_users").first<{ total: number }>(),
      env.DB.prepare("SELECT file_name AS fileName,row_count AS rowCount,table_count AS tableCount,created_at AS createdAt FROM backup_exports ORDER BY id DESC LIMIT 1").first<{ fileName: string; rowCount: number; tableCount: number; createdAt: string }>(),
    ]);

    return json({
      status: "operational",
      checkedAt,
      worker: { status: "operational" },
      database: {
        status: databaseLatencyMs > 1500 ? "slow" : "operational",
        latencyMs: databaseLatencyMs,
        tableCount: Number(tables?.total ?? 0),
        userCount: Number(users?.total ?? 0),
      },
      backup: backup
        ? { status: "available", ...backup }
        : { status: "missing", fileName: null, rowCount: 0, tableCount: 0, createdAt: null },
    });
  } catch {
    return json({
      status: "unavailable",
      checkedAt,
      error: "Не удалось проверить базу данных. Возможно, сервис Cloudflare временно недоступен.",
    }, 503);
  }
}
