import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../db/accounts";
import { ensureAuditTable } from "../../../../db/audit";

type AuditRow = {
  id: number;
  actorId: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: string | null;
  createdAt: string;
};

const allowedActions = new Set(["user.created", "user.deleted", "user.password_reset", "finance.created", "finance.updated", "finance.deleted", "schedule.created", "schedule.deleted", "academic.changed", "grade.created"]);
const allowedEntities = new Set(["user", "finance", "schedule", "academic", "grade"]);

export async function GET(request: Request) {
  try {
    await ensureAccountsTable();
    const user = await userFromRequest(request);
    if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Недостаточно прав" }, { status: 403 });
    await ensureAuditTable();

    const url = new URL(request.url);
    const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const action = (url.searchParams.get("action") || "").trim();
    const entity = (url.searchParams.get("entity") || "").trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 80, 1), 100);
    const where: string[] = [];
    const values: (string | number)[] = [];

    if (action && allowedActions.has(action)) { where.push("action=?"); values.push(action); }
    if (entity && allowedEntities.has(entity)) { where.push("entity_type=?"); values.push(entity); }
    if (search) {
      where.push("(lower(actor_name) LIKE lower(?) OR lower(summary) LIKE lower(?) OR lower(COALESCE(entity_id,'')) LIKE lower(?))");
      const pattern = `%${search.replaceAll("%", "").replaceAll("_", "")}%`;
      values.push(pattern, pattern, pattern);
    }

    const result = await env.DB.prepare(`SELECT id,actor_id actorId,actor_name actorName,actor_role actorRole,action,entity_type entityType,entity_id entityId,summary,metadata,created_at createdAt FROM audit_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...values, limit).all<AuditRow>();
    const logs = result.results.map((row) => {
      let metadata: Record<string, unknown> | null = null;
      try { metadata = row.metadata ? JSON.parse(row.metadata) : null; } catch { metadata = null; }
      return { ...row, metadata };
    });
    return Response.json({ logs });
  } catch {
    return Response.json({ error: "Журнал временно недоступен" }, { status: 500 });
  }
}
