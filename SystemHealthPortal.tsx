"use client";

import { useCallback, useEffect, useState } from "react";
import type { SchoolUser } from "../db/accounts";

type HealthData = {
  status: "operational" | "unavailable";
  checkedAt: string;
  worker?: { status: string };
  database?: { status: string; latencyMs: number; tableCount: number; userCount: number };
  backup?: { status: string; fileName: string | null; rowCount: number; tableCount: number; createdAt: string | null };
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Ещё не создавалась";
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

export default function SystemHealthPortal({ profile }: { profile: SchoolUser }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system-health", { cache: "no-store" });
      const body = (await response.json()) as HealthData;
      setData(body);
      if (!response.ok) setError(body.error || "Проверка временно недоступна");
    } catch {
      setData(null);
      setError("Нет связи с сервером. Попробуйте повторить проверку.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void check();
    const timer = window.setInterval(() => void check(), 30000);
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", close);
    };
  }, [open, check]);

  if (profile.role !== "admin") return null;

  if (!open) {
    return <button className="system-health-fab" onClick={() => setOpen(true)}>● Состояние системы</button>;
  }

  const ok = data?.status === "operational" && !error;
  const databaseOk = data?.database?.status === "operational";

  return (
    <div className="system-health-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="system-health-modal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="system-health-title">
        <button className="system-health-close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
        <header className="system-health-head">
          <div className={`system-health-signal ${ok ? "ok" : "problem"}`}><i /><i /><i /></div>
          <div>
            <span>UK SCHOOL OF TASHKENT · SYSTEM CONTROL</span>
            <h1 id="system-health-title">Состояние системы</h1>
            <p>Безопасная диагностика школьной платформы</p>
          </div>
          <div className={`system-health-main-status ${loading ? "checking" : ok ? "ok" : "problem"}`}>
            <b>{loading ? "Проверяем…" : ok ? "Всё работает" : "Требуется внимание"}</b>
            <span>{data?.checkedAt ? `Проверено ${formatDate(data.checkedAt)}` : "Ожидаем проверку"}</span>
          </div>
        </header>

        {error && <div className="system-health-alert"><div><b>Сервис временно недоступен</b><span>{error}</span></div><button onClick={check} disabled={loading}>Повторить</button></div>}

        <div className="system-health-cards">
          <article>
            <div className={`system-health-icon ${ok ? "green" : "red"}`}>W</div>
            <span>СЕРВЕР ПЛАТФОРМЫ</span>
            <h2>Cloudflare Worker</h2>
            <p>{ok ? "Сервер отвечает на запросы" : "Нет подтверждения связи"}</p>
            <b className={ok ? "health-good" : "health-bad"}>{ok ? "● Работает" : "● Недоступен"}</b>
          </article>
          <article>
            <div className={`system-health-icon ${databaseOk ? "green" : "amber"}`}>D1</div>
            <span>БАЗА ДАННЫХ</span>
            <h2>Cloudflare D1</h2>
            <p>{data?.database ? `${data.database.tableCount} таблиц · ${data.database.userCount} пользователей` : "Ожидаем данные"}</p>
            <b className={databaseOk ? "health-good" : "health-warn"}>{databaseOk ? `● Работает · ${data?.database?.latencyMs} мс` : "● Проверяется"}</b>
          </article>
          <article>
            <div className={`system-health-icon ${data?.backup?.createdAt ? "blue" : "amber"}`}>BK</div>
            <span>ЗАЩИТА ДАННЫХ</span>
            <h2>Последняя копия</h2>
            <p>{formatDate(data?.backup?.createdAt)}</p>
            <b className={data?.backup?.createdAt ? "health-info" : "health-warn"}>{data?.backup?.createdAt ? `${data.backup.rowCount} записей сохранено` : "Создайте первую копию"}</b>
          </article>
        </div>

        <section className="system-health-details">
          <div>
            <span>ТЕХНИЧЕСКАЯ СВОДКА</span>
            <h2>Что проверяет система</h2>
          </div>
          <ul>
            <li><i className={ok ? "done" : ""}>✓</i><div><b>Защищённая сессия администратора</b><span>Чужой пользователь не может открыть диагностику.</span></div></li>
            <li><i className={databaseOk ? "done" : ""}>✓</i><div><b>Ответ основной базы D1</b><span>Проверяется реальным запросом без изменения школьных данных.</span></div></li>
            <li><i className={data?.backup?.createdAt ? "done" : ""}>✓</i><div><b>Готовность резервной копии</b><span>{data?.backup?.fileName || "Резервная копия пока не создавалась."}</span></div></li>
          </ul>
        </section>

        <footer className="system-health-footer">
          <a href="https://www.cloudflarestatus.com/" target="_blank" rel="noreferrer">Официальный статус Cloudflare ↗</a>
          <button onClick={check} disabled={loading}>{loading ? "Проверяем…" : "Проверить ещё раз"}</button>
        </footer>
      </section>
    </div>
  );
}
