import { env } from "cloudflare:workers";

export type Achievement = {
  id: number;
  title: string;
  description: string;
  icon: string;
  awardedAt: string;
  awardedByName: string;
};

export async function ensureAchievements() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS user_achievements(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,icon TEXT NOT NULL DEFAULT '🏆',awarded_by INTEGER NOT NULL,awarded_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON user_achievements(user_id,awarded_at)"),
  ]);
}

export async function achievementsFor(userId: number) {
  await ensureAchievements();
  return (await env.DB.prepare("SELECT a.id,a.title,a.description,a.icon,a.awarded_at awardedAt,COALESCE(u.full_name,'Администратор') awardedByName FROM user_achievements a LEFT JOIN school_users u ON u.id=a.awarded_by WHERE a.user_id=? ORDER BY a.awarded_at DESC,a.id DESC").bind(userId).all<Achievement>()).results;
}
