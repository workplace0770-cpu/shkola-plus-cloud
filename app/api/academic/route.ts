import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../db/accounts";
import { notify } from "../../../db/notifications";

async function init() {
  await ensureAccountsTable();
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS school_classes(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS school_subjects(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS teaching_assignments(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,UNIQUE(teacher_id,class_id,subject_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS grades(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,assignment_id INTEGER NOT NULL,value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5),created_at TEXT NOT NULL)"),
    env.DB.prepare("INSERT OR IGNORE INTO school_classes(name) SELECT DISTINCT class_name FROM school_users WHERE role='student' AND class_name IS NOT NULL AND trim(class_name)!=''"),
  ]);
}

export async function GET(r: Request) {
  await init();
  const u = await userFromRequest(r);
  if (!u) return Response.json({ error: "Нет доступа" }, { status: 401 });

  const classes = (await env.DB.prepare("SELECT id,name FROM school_classes ORDER BY name").all()).results;
  const subjects = (await env.DB.prepare("SELECT id,name FROM school_subjects ORDER BY name").all()).results;

  if (u.role === "admin") {
    const teachers = (await env.DB.prepare("SELECT id,full_name fullName FROM school_users WHERE role='teacher' ORDER BY full_name").all()).results;
    const assignments = (await env.DB.prepare("SELECT a.id,t.full_name teacher,c.name className,s.name subject FROM teaching_assignments a JOIN school_users t ON t.id=a.teacher_id JOIN school_classes c ON c.id=a.class_id JOIN school_subjects s ON s.id=a.subject_id ORDER BY c.name,s.name").all()).results;
    return Response.json({ role: u.role, classes, subjects, teachers, assignments });
  }

  if (u.role === "teacher") {
    const assignments = (await env.DB.prepare("SELECT a.id,c.name className,s.name subject FROM teaching_assignments a JOIN school_classes c ON c.id=a.class_id JOIN school_subjects s ON s.id=a.subject_id WHERE a.teacher_id=?").bind(u.id).all()).results;
    const students = (await env.DB.prepare("SELECT id,full_name fullName,class_name className FROM school_users WHERE role='student' ORDER BY full_name").all()).results;
    const grades = (await env.DB.prepare("SELECT g.id,g.student_id studentId,g.assignment_id assignmentId,g.value,g.created_at createdAt FROM grades g JOIN teaching_assignments a ON a.id=g.assignment_id WHERE a.teacher_id=? ORDER BY g.id DESC").bind(u.id).all()).results;
    return Response.json({ role: u.role, assignments, students, grades });
  }

  const grades = (await env.DB.prepare("SELECT g.value,g.created_at createdAt,s.name subject FROM grades g JOIN teaching_assignments a ON a.id=g.assignment_id JOIN school_subjects s ON s.id=a.subject_id WHERE g.student_id=? ORDER BY g.id DESC").bind(u.id).all()).results;
  return Response.json({ role: u.role, grades });
}

export async function POST(r: Request) {
  await init();
  const u = await userFromRequest(r);
  if (!u) return Response.json({ error: "Нет доступа" }, { status: 401 });
  const b = await r.json() as Record<string, unknown>;

  if (u.role === "admin") {
    if (b.action === "class") await env.DB.prepare("INSERT OR IGNORE INTO school_classes(name) VALUES(?)").bind(String(b.name).trim()).run();
    if (b.action === "subject") await env.DB.prepare("INSERT OR IGNORE INTO school_subjects(name) VALUES(?)").bind(String(b.name).trim()).run();
    if (b.action === "assign") await env.DB.prepare("INSERT OR IGNORE INTO teaching_assignments(teacher_id,class_id,subject_id) VALUES(?,?,?)").bind(Number(b.teacherId), Number(b.classId), Number(b.subjectId)).run();
    return Response.json({ ok: true });
  }

  if (u.role === "teacher" && b.action === "grade") {
    const assignment = await env.DB.prepare("SELECT a.id,s.name subject FROM teaching_assignments a JOIN school_subjects s ON s.id=a.subject_id WHERE a.id=? AND a.teacher_id=?").bind(Number(b.assignmentId), u.id).first<{ id: number; subject: string }>();
    if (!assignment) return Response.json({ error: "Нет доступа" }, { status: 403 });

    const student = await env.DB.prepare("SELECT id FROM school_users WHERE id=? AND role='student'").bind(Number(b.studentId)).first<{ id: number }>();
    if (!student) return Response.json({ error: "Ученик не найден" }, { status: 404 });

    const value = Number(b.value);
    if (!Number.isInteger(value) || value < 1 || value > 5) return Response.json({ error: "Неверная оценка" }, { status: 400 });

    await env.DB.prepare("INSERT INTO grades(student_id,assignment_id,value,created_at) VALUES(?,?,?,?)").bind(student.id, assignment.id, value, new Date().toISOString()).run();
    await notify(student.id, "grade", "Новая оценка", `${assignment.subject}: ${value}`, "journal");
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Недопустимое действие" }, { status: 403 });
}
