import { env } from "cloudflare:workers";
import { ensureAccountsTable, hashPassword, listSchoolUsers, makeUsername, temporaryPassword, userFromRequest, type SchoolRole } from "../../../db/accounts";
import { recordAudit } from "../../../db/audit";

async function admin(request: Request) {
  await ensureAccountsTable();
  const user = await userFromRequest(request);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET(request: Request) {
  const actor = await admin(request);
  if (!actor) return Response.json({ error: "Нет доступа" }, { status: 403 });
  return Response.json({ users: await listSchoolUsers() });
}

export async function POST(request: Request) {
  const actor = await admin(request);
  if (!actor) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const input = await request.json() as { fullName?: string; role?: SchoolRole; className?: string; subjectName?: string };
  const name = input.fullName?.trim(), className = input.className?.trim(), subjectName = input.subjectName?.trim();
  if (!name || !["student", "teacher"].includes(input.role ?? "") || (input.role === "student" && !className) || (input.role === "teacher" && !subjectName)) {
    return Response.json({ error: "Заполните имя, роль, класс или предмет" }, { status: 400 });
  }
  const duplicate = await env.DB.prepare("SELECT id FROM school_users WHERE lower(full_name)=lower(?) AND role=? AND COALESCE(class_name,'')=COALESCE(?, '')").bind(name, input.role, input.role === "student" ? className : null).first();
  if (duplicate) return Response.json({ error: "Такой пользователь уже существует" }, { status: 409 });
  const max = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 next FROM school_users").first<{ next: number }>();
  const username = makeUsername(name, Number(max?.next ?? 1)), password = temporaryPassword(), { salt, hash } = await hashPassword(password);
  await env.DB.prepare("INSERT INTO school_users(email,username,full_name,role,class_name,created_at,password_hash,password_salt,must_change_password)VALUES(NULL,?,?,?,?,?,?,?,1)").bind(username, name, input.role, input.role === "student" ? className : null, new Date().toISOString(), hash, salt).run();
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS school_classes(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS school_subjects(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)"),
  ]);
  if (className) await env.DB.prepare("INSERT OR IGNORE INTO school_classes(name)VALUES(?)").bind(className).run();
  if (subjectName) await env.DB.prepare("INSERT OR IGNORE INTO school_subjects(name)VALUES(?)").bind(subjectName).run();
  const created = await env.DB.prepare("SELECT id FROM school_users WHERE username=?").bind(username).first<{ id: number }>();
  await recordAudit(actor, { action: "user.created", entityType: "user", entityId: created?.id, summary: `Создан ${input.role === "student" ? "ученик" : "учитель"}: ${name}`, metadata: { role: input.role, className, subjectName, username } });
  return Response.json({ users: await listSchoolUsers(), credentials: { username, password, fullName: name } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const actor = await admin(request);
  if (!actor) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Некорректный пользователь" }, { status: 400 });
  const target = await env.DB.prepare("SELECT id,full_name fullName,role,username FROM school_users WHERE id=? AND role!='admin'").bind(id).first<{ id: number; fullName: string; role: string; username: string }>();
  if (!target) return Response.json({ error: "Пользователь не найден" }, { status: 404 });
  await env.DB.prepare("DELETE FROM school_users WHERE id=? AND role!='admin'").bind(id).run();
  await recordAudit(actor, { action: "user.deleted", entityType: "user", entityId: id, summary: `Удалён пользователь: ${target.fullName}`, metadata: { role: target.role, username: target.username } });
  return Response.json({ users: await listSchoolUsers() });
}

export async function PATCH(request: Request) {
  const actor = await admin(request);
  if (!actor) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const user = await env.DB.prepare("SELECT id,username,full_name fullName,role FROM school_users WHERE id=? AND role!='admin'").bind(id).first<{ id: number; username: string; fullName: string; role: string }>();
  if (!user) return Response.json({ error: "Пользователь не найден" }, { status: 404 });
  const password = temporaryPassword(), { salt, hash } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare("UPDATE school_users SET password_hash=?,password_salt=?,must_change_password=1 WHERE id=?").bind(hash, salt, id),
    env.DB.prepare("DELETE FROM school_sessions WHERE user_id=?").bind(id),
  ]);
  await recordAudit(actor, { action: "user.password_reset", entityType: "user", entityId: id, summary: `Сброшен пароль пользователя: ${user.fullName}`, metadata: { role: user.role, username: user.username } });
  return Response.json({ users: await listSchoolUsers(), credentials: { username: user.username, password, fullName: user.fullName } });
}
