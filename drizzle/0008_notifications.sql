CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,link TEXT,created_at TEXT NOT NULL,read_at TEXT);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id,created_at);
