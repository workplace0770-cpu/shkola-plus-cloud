"use client";

import { useCallback, useEffect, useState } from "react";
import type { SchoolUser } from "../db/accounts";

type AuditLog = {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const actionLabels: Record<string, { label: string; icon: string; tone: string }> = {
  "user.created": { label: "Пользователь создан", icon: "+", tone: "green" },
  "user.deleted": { label: "Пользователь удалён", icon: "×", tone: "red" },
  "user.password_reset": { label: "Пароль сброшен", icon: "⌁", tone: "amber" },
  "finance.created": { label: "Финансовая запись создана", icon: "₸", tone: "blue" },
  "finance.updated": { label: "Финансовая запись изменена", icon: "↻", tone: "blue" },
  "finance.deleted": { label: "Финансовая запись удалена", icon: "×", tone: "red" },
  "schedule.created": { label: "Урок добавлен", icon: "+", tone: "violet" },
  "schedule.deleted": { label: "Урок удалён", icon: "×", tone: "red" },
  "academic.changed": { label: "Учебные настройки изменены", icon: "A", tone: "violet" },
  "grade.created": { label: "Оценка поставлена", icon: "5", tone: "green" },
};

const entityLabels: Record<string, string> = { user: "Пользователи", finance: "Финансы", schedule: "Расписание", academic: "Учебная часть", grade: "Оценки" };

function displayDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function readError(response: Response) {
  try { return ((await response.json()) as { error?: string }).error || "Не удалось загрузить журнал"; }
  catch { return "Не удалось загрузить журнал"; }
}

export default function AuditLogPortal({ profile }: { profile: SchoolUser }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("q", search.trim());
      if (action) params.set("action", action);
      if (entity) params.set("entity", entity);
      const response = await fetch(`/api/admin/audit-logs?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setLogs(((await response.json()) as { logs?: AuditLog[] }).logs || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить журнал"); }
    finally { setLoading(false); }
  }, [search, action, entity]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 250);
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", close); };
  }, [open, load]);

  if (profile.role !== "admin") return null;
  if (!open) return <button className="audit-fab" onClick={() => setOpen(true)}><span>◷</span> История действий</button>;

  return <div className="audit-backdrop" onMouseDown={() => setOpen(false)}>
    <section className="audit-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="audit-title">
      <button className="audit-close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
      <header className="audit-header">
        <div className="audit-mark">◷</div>
        <div><span>UK SCHOOL OF TASHKENT · SECURITY</span><h1 id="audit-title">История действий</h1><p>Контроль важных изменений в школьной платформе</p></div>
        <div className="audit-secure"><b>Защищённый журнал</b><small>Записи нельзя изменить через интерфейс</small></div>
      </header>

      <div className="audit-toolbar">
        <label className="audit-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти сотрудника или действие" /></label>
        <select value={entity} onChange={(event) => setEntity(event.target.value)}><option value="">Все разделы</option>{Object.entries(entityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <select value={action} onChange={(event) => setAction(event.target.value)}><option value="">Все действия</option>{Object.entries(actionLabels).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}</select>
        <button onClick={load} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
      </div>

      {error && <div className="audit-error"><span><b>Журнал временно недоступен</b>{error}</span><button onClick={load}>Повторить</button></div>}
      <div className="audit-summary"><b>{logs.length}</b><span>найдено записей</span><i>Время отображается по Ташкенту</i></div>

      <div className="audit-list" aria-busy={loading}>
        {loading && !logs.length && <div className="audit-empty"><i className="audit-loader" /><b>Загружаем историю…</b></div>}
        {!loading && !error && !logs.length && <div className="audit-empty"><div>✓</div><b>Записей пока нет</b><span>Новые важные действия будут автоматически появляться здесь.</span></div>}
        {logs.map((log) => {
          const style = actionLabels[log.action] || { label: log.action, icon: "•", tone: "blue" };
          return <article className="audit-row" key={log.id}>
            <div className={`audit-icon ${style.tone}`}>{style.icon}</div>
            <div className="audit-main"><div><b>{log.summary}</b><span className={`audit-badge ${style.tone}`}>{style.label}</span></div><p><strong>{log.actorName}</strong><span>{log.actorRole === "admin" ? "Администратор" : log.actorRole}</span>{log.entityId && <code>№ {log.entityId}</code>}</p></div>
            <time dateTime={log.createdAt}>{displayDate(log.createdAt)}</time>
          </article>;
        })}
      </div>
    </section>
  </div>;
}
