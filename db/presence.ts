import { env } from "cloudflare:workers";

let presenceReady: Promise<void> | null = null;

export function ensurePresenceTable() {
  if (!presenceReady) {
    presenceReady = env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS user_presence (
          user_id INTEGER PRIMARY KEY NOT NULL,
          last_seen_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES school_users(id) ON DELETE CASCADE
        )
      `),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON user_presence(last_seen_at)"),
    ]).then(() => undefined).catch(error => {
      presenceReady = null;
      throw error;
    });
  }
  return presenceReady;
}
