import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../db/accounts";
import { ensureBackupExportsTable } from "../../../../db/backups";

const SAFE_TABLES = [
  "school_classes", "school_subjects", "teaching_assignments", "grades", "schedule_lessons",
  "chats", "chat_members", "messages", "finance_records", "school_bulletins", "user_achievements",
  "coin_wallets", "coin_history", "assessments", "assessment_questions", "assessment_attempts",
  "shop_items", "shop_orders", "notifications",
] as const;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function requireAdmin(request: Request) {
  await ensureAccountsTable();
  const user = await userFromRequest(request);
  if (!user) return { response: json({ error: "Требуется вход" }, 401), user: null };
  if (user.role !== "admin") return { response: json({ error: "Недостаточно прав" }, 403), user: null };
  return { response: null, user };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    await ensureBackupExportsTable();
    const history = await env.DB.prepare(`SELECT b.id,b.file_name fileName,b.row_count rowCount,b.table_count tableCount,b.checksum,b.created_at createdAt,COALESCE(u.full_name,'Администратор') createdByName FROM backup_exports b LEFT JOIN school_users u ON u.id=b.created_by ORDER BY b.id DESC LIMIT 25`).all();
    return json({ history: history.results });
  } catch { return json({ error: "Не удалось загрузить журнал резервных копий" }, 500); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response || !auth.user) return auth.response!;
    await ensureBackupExportsTable();
    const tableRows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const existing = new Set(tableRows.results.map((row) => row.name));
    const tables: Record<string, unknown[]> = {};
    if (existing.has("school_users")) {
      const users = await env.DB.prepare(`SELECT id,COALESCE(email,'') email,COALESCE(username,'') username,full_name fullName,role,class_name className,created_at createdAt,must_change_password mustChangePassword FROM school_users ORDER BY id`).all();
      tables.school_users = users.results;
    }
    for (const table of SAFE_TABLES) {
      if (!existing.has(table)) continue;
      tables[table] = (await env.DB.prepare(`SELECT * FROM "${table}"`).all()).results;
    }
    const exportedAt = new Date().toISOString();
    const payload = { format: "uk-school-d1-backup", version: 1, exportedAt, exportedBy: { id: auth.user.id, fullName: auth.user.fullName, role: auth.user.role }, security: { credentialsIncluded: false, sessionsIncluded: false, note: "Пароли, соли паролей, аварийный доступ и активные сессии намеренно исключены." }, tables };
    const contents = JSON.stringify(payload, null, 2);
    const checksum = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contents)));
    const rowCount = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
    const fileName = `uk-school-backup-${exportedAt.replace(/[:.]/g, "-")}.json`;
    await env.DB.prepare(`INSERT INTO backup_exports(file_name,row_count,table_count,checksum,created_by,created_at) VALUES(?,?,?,?,?,?)`).bind(fileName, rowCount, Object.keys(tables).length, checksum, auth.user.id, exportedAt).run();
    return new Response(contents, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store", "x-backup-checksum": checksum } });
  } catch { return json({ error: "Не удалось создать резервную копию" }, 500); }
}
