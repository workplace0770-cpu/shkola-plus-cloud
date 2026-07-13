CREATE TABLE IF NOT EXISTS school_bulletins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('announcement','event')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('all','students','teachers','class')),
  target_class TEXT,
  event_at TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS school_bulletins_created_idx ON school_bulletins(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS school_bulletins_event_idx ON school_bulletins(event_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS school_bulletins_audience_idx ON school_bulletins(audience,target_class);
