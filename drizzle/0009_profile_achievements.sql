CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  awarded_by INTEGER NOT NULL,
  awarded_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON user_achievements(user_id, awarded_at);
