import { env } from "cloudflare:workers";
import type { SchoolUser } from "./accounts";

export type AuditAction =
  | "user.created"
  | "user.deleted"
  | "user.password_reset"
  | "finance.created"
  | "finance.updated"
  | "finance.deleted"
  | "schedule.created"
  | "schedule.deleted"
  | "academic.changed"
  | "grade.created";

export type AuditEvent = {
  action: AuditAction;
  entityType: "user" | "finance" | "schedule" | "academic" | "grade";
  entityId?: string | number | null;
  summary: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export async function ensureAuditTable() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL,actor_name TEXT NOT NULL,actor_role TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT,summary TEXT NOT NULL,metadata TEXT,created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id,created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action,created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type,entity_id)"),
  ]);
}

function safeMetadata(metadata?: AuditEvent["metadata"]) {
  if (!metadata) return null;
  const clean = Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key.slice(0, 80), typeof value === "string" ? value.slice(0, 500) : value]),
  );
  const encoded = JSON.stringify(clean);
  return encoded.length <= 4000 ? encoded : JSON.stringify({ note: "Дополнительные сведения сокращены" });
}

export async function recordAudit(actor: SchoolUser, event: AuditEvent) {
  try {
    await ensureAuditTable();
    await env.DB.prepare("INSERT INTO audit_logs(actor_id,actor_name,actor_role,action,entity_type,entity_id,summary,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
        actor.id,
        actor.fullName.slice(0, 160),
        actor.role,
        event.action,
        event.entityType,
        event.entityId === null || event.entityId === undefined ? null : String(event.entityId).slice(0, 160),
        event.summary.slice(0, 500),
        safeMetadata(event.metadata),
        new Date().toISOString(),
      )
      .run();
  } catch {
    // Аудит не должен блокировать основную школьную операцию.
  }
}
