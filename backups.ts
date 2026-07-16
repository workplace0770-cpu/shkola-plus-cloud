import { env } from "cloudflare:workers";

export async function ensureBackupExportsTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS backup_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      table_count INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS backup_exports_created_idx ON backup_exports(created_at)"),
  ]);
}
