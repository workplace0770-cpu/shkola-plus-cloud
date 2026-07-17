import { env } from "cloudflare:workers";
import { userFromRequest } from "../../../../db/accounts";
import type { LivingSchoolAtmosphere, LivingSchoolSnapshot } from "../../../living-school/living-school-types";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

type Binding = string | number;

function tashkentRanges(now = new Date()) {
  const offset = 5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const todayStart = localMidnight - offset;
  const day = local.getUTCDay() || 7;
  const weekStart = todayStart - (day - 1) * 24 * 60 * 60 * 1000;
  return {
    todayStart: new Date(todayStart).toISOString(),
    tomorrowStart: new Date(todayStart + 24 * 60 * 60 * 1000).toISOString(),
    weekStart: new Date(weekStart).toISOString(),
  };
}

async function count(sql: string, bindings: Binding[] = []) {
  const row = await env.DB.prepare(sql).bind(...bindings).first<{ total: number }>();
  return Math.max(0, Number(row?.total ?? 0));
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

export async function GET(request: Request) {
  try {
    const currentUser = await userFromRequest(request);
    if (!currentUser) return json({ error: "Требуется авторизация" }, 401);

    const tableRows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('school_users','grades','messages','assessment_attempts','user_achievements','audit_logs')",
    ).all<{ name: string }>();
    const tables = new Set(tableRows.results.map(row => row.name));
    const { todayStart, tomorrowStart, weekStart } = tashkentRanges();

    const positiveGradesToday = tables.has("grades")
      ? await count("SELECT COUNT(*) total FROM grades WHERE value>=4 AND created_at>=? AND created_at<?", [todayStart, tomorrowStart])
      : 0;
    const positiveGradesAll = tables.has("grades")
      ? await count("SELECT COUNT(*) total FROM grades WHERE value>=4")
      : 0;

    const achievementsToday = tables.has("user_achievements")
      ? await count("SELECT COUNT(*) total FROM user_achievements WHERE awarded_at>=? AND awarded_at<?", [todayStart, tomorrowStart])
      : 0;
    const weeklyAchievements = tables.has("user_achievements")
      ? await count("SELECT COUNT(*) total FROM user_achievements WHERE awarded_at>=? AND awarded_at<?", [weekStart, tomorrowStart])
      : 0;
    const achievementsAll = tables.has("user_achievements")
      ? await count("SELECT COUNT(*) total FROM user_achievements")
      : 0;

    const completedAttempts = tables.has("assessment_attempts")
      ? await count("SELECT COUNT(*) total FROM assessment_attempts")
      : 0;
    const perfectAttemptsToday = tables.has("assessment_attempts")
      ? await count("SELECT COUNT(*) total FROM assessment_attempts WHERE total>0 AND score=total AND created_at>=? AND created_at<?", [todayStart, tomorrowStart])
      : 0;
    const perfectAttemptsAll = tables.has("assessment_attempts")
      ? await count("SELECT COUNT(*) total FROM assessment_attempts WHERE total>0 AND score=total")
      : 0;

    const activitySources: string[] = [];
    const activityBindings: Binding[] = [];
    if (tables.has("messages")) {
      activitySources.push("SELECT sender_id user_id FROM messages WHERE deleted_at IS NULL AND created_at>=? AND created_at<?");
      activityBindings.push(todayStart, tomorrowStart);
    }
    if (tables.has("assessment_attempts")) {
      activitySources.push("SELECT student_id user_id FROM assessment_attempts WHERE created_at>=? AND created_at<?");
      activityBindings.push(todayStart, tomorrowStart);
    }
    if (tables.has("audit_logs")) {
      activitySources.push("SELECT actor_id user_id FROM audit_logs WHERE created_at>=? AND created_at<?");
      activityBindings.push(todayStart, tomorrowStart);
    }

    let activeStudentsToday = 0;
    let activeTeachersToday = 0;
    if (tables.has("school_users") && activitySources.length) {
      const activity = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN u.role='student' THEN 1 ELSE 0 END),0) students,
          COALESCE(SUM(CASE WHEN u.role='teacher' THEN 1 ELSE 0 END),0) teachers
        FROM school_users u
        JOIN (SELECT DISTINCT user_id FROM (${activitySources.join(" UNION ALL ")})) a ON a.user_id=u.id
      `).bind(...activityBindings).first<{ students: number; teachers: number }>();
      activeStudentsToday = Math.max(0, Number(activity?.students ?? 0));
      activeTeachersToday = Math.max(0, Number(activity?.teachers ?? 0));
    }

    const roleTotals = tables.has("school_users")
      ? await env.DB.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN role='student' THEN 1 ELSE 0 END),0) students,
            COALESCE(SUM(CASE WHEN role='teacher' THEN 1 ELSE 0 END),0) teachers
          FROM school_users
        `).first<{ students: number; teachers: number }>()
      : null;
    const activePopulation = activeStudentsToday + activeTeachersToday;
    const totalPopulation = Number(roleTotals?.students ?? 0) + Number(roleTotals?.teachers ?? 0);
    const positiveEventsToday = positiveGradesToday + achievementsToday + perfectAttemptsToday;
    const knowledgeTreeLeaves = positiveGradesAll + completedAttempts + achievementsAll;
    const knowledgeTreeGoldenFlowers = achievementsAll + perfectAttemptsAll;
    const knowledgeTreeLevel = Math.max(1, Math.floor(knowledgeTreeLeaves / 100) + 1);
    const knowledgeTreeProgress = knowledgeTreeLeaves % 100;
    const activityScore = totalPopulation > 0 ? (activePopulation / totalPopulation) * 50 : 0;
    const schoolEnergy = clamp(activityScore + Math.min(30, positiveEventsToday * 3) + Math.min(20, weeklyAchievements * 2), 0, 100);

    let atmosphere: LivingSchoolAtmosphere = "calm";
    if (positiveEventsToday >= 10 || weeklyAchievements >= 5) atmosphere = "celebrating";
    else if (schoolEnergy >= 60) atmosphere = "active";
    else if (schoolEnergy >= 25 || positiveEventsToday > 0) atmosphere = "inspired";

    const snapshot: LivingSchoolSnapshot = {
      activeStudentsToday,
      activeTeachersToday,
      positiveGradesToday,
      positiveEventsToday,
      weeklyAchievements,
      schoolEnergy,
      knowledgeTreeLevel,
      knowledgeTreeLeaves,
      knowledgeTreeGoldenFlowers,
      knowledgeTreeProgress,
      atmosphere,
      generatedAt: new Date().toISOString(),
      dataMode: "partial",
    };

    return json(snapshot);
  } catch {
    return json({ error: "Не удалось получить агрегированную статистику школы" }, 503);
  }
}
