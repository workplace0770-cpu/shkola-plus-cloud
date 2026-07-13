import { env } from "cloudflare:workers";
import { achievementsFor, ensureAchievements } from "../../../db/achievements";
import { ensureAccountsTable, getUserById, listSchoolUsers, userFromRequest } from "../../../db/accounts";
import { notify } from "../../../db/notifications";

async function profilePayload(userId: number) {
  const user = await getUserById(userId);
  if (!user) return null;
  const [wallet, gradeStats, attemptStats, achievements] = await Promise.all([
    env.DB.prepare("SELECT balance FROM coin_wallets WHERE user_id=?").bind(userId).first<{ balance: number }>(),
    env.DB.prepare("SELECT ROUND(AVG(value),2) average,COUNT(*) total FROM grades WHERE student_id=?").bind(userId).first<{ average: number | null; total: number }>(),
    env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(reward),0) earned,COALESCE(MAX(CASE WHEN score=total THEN 1 ELSE 0 END),0) hasPerfect FROM assessment_attempts WHERE student_id=?").bind(userId).first<{ total: number; earned: number; hasPerfect: number }>(),
    achievementsFor(userId),
  ]);
  return {
    user,
    stats: {
      balance: Number(wallet?.balance ?? 0),
      averageGrade: gradeStats?.average == null ? null : Number(gradeStats.average),
      gradeCount: Number(gradeStats?.total ?? 0),
      attemptsCount: Number(attemptStats?.total ?? 0),
      coinsEarnedInTests: Number(attemptStats?.earned ?? 0),
      perfectResult: Boolean(attemptStats?.hasPerfect),
    },
    achievements,
  };
}

export async function GET(request: Request) {
  try {
    await ensureAccountsTable();
    await ensureAchievements();
    const current = await userFromRequest(request);
    if (!current) return Response.json({ error: "Необходимо войти в аккаунт" }, { status: 401 });
    const requestedId = Number(new URL(request.url).searchParams.get("userId"));
    const userId = requestedId && current.role === "admin" ? requestedId : current.id;
    const profile = await profilePayload(userId);
    if (!profile) return Response.json({ error: "Пользователь не найден" }, { status: 404 });
    const users = current.role === "admin" ? (await listSchoolUsers()).map(({ id, fullName, role, className }) => ({ id, fullName, role, className })) : undefined;
    return Response.json({ ...profile, users });
  } catch {
    return Response.json({ error: "Не удалось загрузить профиль" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureAccountsTable();
    await ensureAchievements();
    const current = await userFromRequest(request);
    if (!current) return Response.json({ error: "Необходимо войти в аккаунт" }, { status: 401 });
    if (current.role !== "admin") return Response.json({ error: "Только администратор может выдавать достижения" }, { status: 403 });
    const body = await request.json() as { userId?: unknown; title?: unknown; description?: unknown; icon?: unknown };
    const userId = Number(body.userId), title = String(body.title ?? "").trim(), description = String(body.description ?? "").trim(), icon = String(body.icon ?? "🏆").trim() || "🏆";
    if (!Number.isInteger(userId) || userId < 1 || !(await getUserById(userId))) return Response.json({ error: "Пользователь не найден" }, { status: 404 });
    if (title.length < 2 || title.length > 80) return Response.json({ error: "Название должно содержать от 2 до 80 символов" }, { status: 400 });
    if (description.length > 300) return Response.json({ error: "Описание слишком длинное" }, { status: 400 });
    if (Array.from(icon).length > 4) return Response.json({ error: "Для значка выберите короткий эмодзи" }, { status: 400 });
    await env.DB.prepare("INSERT INTO user_achievements(user_id,title,description,icon,awarded_by,awarded_at) VALUES(?,?,?,?,?,?)").bind(userId, title, description, icon, current.id, new Date().toISOString()).run();
    await notify(userId, "achievement", "Новое достижение", `${icon} ${title}`, "profile");
    return Response.json(await profilePayload(userId));
  } catch {
    return Response.json({ error: "Не удалось сохранить достижение" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAccountsTable();
    await ensureAchievements();
    const current = await userFromRequest(request);
    if (!current) return Response.json({ error: "Необходимо войти в аккаунт" }, { status: 401 });
    if (current.role !== "admin") return Response.json({ error: "Нет доступа" }, { status: 403 });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Достижение не найдено" }, { status: 400 });
    await env.DB.prepare("DELETE FROM user_achievements WHERE id=?").bind(id).run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось удалить достижение" }, { status: 500 });
  }
}
