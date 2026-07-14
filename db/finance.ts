import { env } from "cloudflare:workers";
import type { SchoolUser } from "./accounts";

export const financeTypes = ["income", "expense", "fee", "event_budget", "shop"] as const;
export const financeStatuses = ["pending", "paid", "overdue", "cancelled"] as const;
export type FinanceType = typeof financeTypes[number];
export type FinanceStatus = typeof financeStatuses[number];

export async function ensureFinanceTables() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS finance_records (
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
  )`).run();
  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS finance_records_status_idx ON finance_records(status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS finance_records_type_idx ON finance_records(type)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS finance_records_student_idx ON finance_records(student_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS finance_records_class_idx ON finance_records(class_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS finance_records_created_idx ON finance_records(created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS finance_records_due_idx ON finance_records(due_date)"),
  ]);
}

export function derivedStatusSql(alias = "f") {
  return `CASE WHEN ${alias}.status='pending' AND ${alias}.due_date IS NOT NULL AND date(${alias}.due_date)<date('now') THEN 'overdue' ELSE ${alias}.status END`;
}

export function financeScope(user: SchoolUser, alias = "f"):{sql:string;params:(string|number)[]} {
  if (user.role === "admin") return { sql: "1=1", params: [] };
  if (user.role === "student") {
    return {
      sql: `(${alias}.student_id=? OR (${alias}.student_id IS NULL AND ${alias}.class_id IN (SELECT id FROM school_classes WHERE name=?)))`,
      params: [user.id, user.className ?? ""],
    };
  }
  return {
    sql: `(${alias}.class_id IN (SELECT class_id FROM teaching_assignments WHERE teacher_id=?) OR ${alias}.student_id IN (
      SELECT s.id FROM school_users s
      JOIN school_classes c ON c.name=s.class_name
      JOIN teaching_assignments ta ON ta.class_id=c.id
      WHERE ta.teacher_id=?
    ))`,
    params: [user.id, user.id],
  };
}

export async function validateFinanceTargets(studentId:number|null,classId:number|null) {
  let student:null|{id:number;className:string|null}=null;
  let schoolClass:null|{id:number;name:string}=null;
  if (studentId !== null) {
    student = await env.DB.prepare("SELECT id,class_name className FROM school_users WHERE id=? AND role='student'").bind(studentId).first<{id:number;className:string|null}>();
    if (!student) return { error: "Ученик не найден" } as const;
  }
  if (classId !== null) {
    schoolClass = await env.DB.prepare("SELECT id,name FROM school_classes WHERE id=?").bind(classId).first<{id:number;name:string}>();
    if (!schoolClass) return { error: "Класс не найден" } as const;
  }
  if (student && schoolClass && student.className !== schoolClass.name) return { error: "Ученик не относится к выбранному классу" } as const;
  return { student, schoolClass } as const;
}

export function financeError() {
  return Response.json({ error: "Не удалось выполнить финансовую операцию" }, { status: 500 });
}
