CREATE TABLE IF NOT EXISTS user_presence (
  user_id INTEGER PRIMARY KEY NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES school_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON user_presence(last_seen_at);
