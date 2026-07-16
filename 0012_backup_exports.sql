CREATE TABLE IF NOT EXISTS backup_exports (id INTEGER PRIMARY KEY AUTOINCREMENT,file_name TEXT NOT NULL,row_count INTEGER NOT NULL,table_count INTEGER NOT NULL,checksum TEXT NOT NULL,created_by INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS backup_exports_created_idx ON backup_exports(created_at);
