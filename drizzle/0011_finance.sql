CREATE TABLE IF NOT EXISTS finance_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('income','expense','fee','event_budget','shop')),
  title TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'KZT',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue','cancelled')),
  student_id INTEGER,
  class_id INTEGER,
  created_by INTEGER NOT NULL,
  due_date TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS finance_records_status_idx ON finance_records(status);
CREATE INDEX IF NOT EXISTS finance_records_type_idx ON finance_records(type);
CREATE INDEX IF NOT EXISTS finance_records_student_idx ON finance_records(student_id);
CREATE INDEX IF NOT EXISTS finance_records_class_idx ON finance_records(class_id);
CREATE INDEX IF NOT EXISTS finance_records_created_idx ON finance_records(created_at);
CREATE INDEX IF NOT EXISTS finance_records_due_idx ON finance_records(due_date);
