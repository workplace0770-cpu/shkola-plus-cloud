import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../db/accounts";
import { derivedStatusSql, ensureFinanceTables, financeError } from "../../../../db/finance";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const from = `${month}-01`;
  const next = monthNumber === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  return { from, next };
}

export async function GET(request: Request) {
  try {
    await ensureAccountsTable();
    await ensureFinanceTables();
    const user = await userFromRequest(request);
    if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Недостаточно прав" }, { status: 403 });

    const url = new URL(request.url);
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!monthPattern.test(month)) return Response.json({ error: "Некорректный месяц" }, { status: 400 });

    const rawClassId = url.searchParams.get("class_id");
    const classId = rawClassId ? Number(rawClassId) : null;
    if (classId !== null && (!Number.isInteger(classId) || classId < 1)) {
      return Response.json({ error: "Некорректный класс" }, { status: 400 });
    }

    const { from, next } = monthRange(month);
    const status = derivedStatusSql("f");
    const classSql = classId === null
      ? "1=1"
      : "(f.class_id=? OR s.class_name=(SELECT name FROM school_classes WHERE id=?))";
    const periodSql = "date(COALESCE(f.due_date,f.created_at))>=date(?) AND date(COALESCE(f.due_date,f.created_at))<date(?)";
    const params: (string | number)[] = classId === null ? [from, next] : [classId, classId, from, next];

    const summary = await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN f.type NOT IN ('expense','event_budget') AND ${status}!='cancelled' THEN f.amount ELSE 0 END),0) charged,
      COALESCE(SUM(CASE WHEN f.type NOT IN ('expense','event_budget') AND ${status}='paid' THEN f.amount ELSE 0 END),0) paid,
      COALESCE(SUM(CASE WHEN f.type NOT IN ('expense','event_budget') AND ${status}='pending' THEN f.amount ELSE 0 END),0) pending,
      COALESCE(SUM(CASE WHEN f.type NOT IN ('expense','event_budget') AND ${status}='overdue' THEN f.amount ELSE 0 END),0) overdue,
      COALESCE(SUM(CASE WHEN f.type IN ('expense','event_budget') AND ${status}!='cancelled' THEN f.amount ELSE 0 END),0) expenses,
      SUM(CASE WHEN ${status}!='cancelled' THEN 1 ELSE 0 END) recordCount
      FROM finance_records f
      LEFT JOIN school_users s ON s.id=f.student_id
      LEFT JOIN school_classes c ON c.id=f.class_id
      WHERE ${classSql} AND ${periodSql}`)
      .bind(...params).first();

    const debtorParams: (string | number)[] = classId === null ? [next] : [classId, classId, next];
    const debtors = (await env.DB.prepare(`SELECT
      s.id studentId,
      s.full_name studentName,
      s.class_name className,
      COUNT(*) debtCount,
      SUM(f.amount) debtAmount,
      MIN(f.due_date) oldestDueDate
      FROM finance_records f
      JOIN school_users s ON s.id=f.student_id AND s.role='student'
      LEFT JOIN school_classes c ON c.id=f.class_id
      WHERE ${classSql}
        AND f.type NOT IN ('expense','event_budget')
        AND ${status} IN ('pending','overdue')
        AND date(COALESCE(f.due_date,f.created_at))<date(?)
      GROUP BY s.id,s.full_name,s.class_name
      ORDER BY debtAmount DESC,s.full_name ASC
      LIMIT 200`).bind(...debtorParams).all()).results;

    const classes = (await env.DB.prepare("SELECT id,name FROM school_classes ORDER BY name").all()).results;
    return Response.json({ month, summary, debtors, classes });
  } catch {
    return financeError();
  }
}
