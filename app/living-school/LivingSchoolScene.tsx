"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LivingSchoolSnapshot, SchoolEvent, TimeOfDay } from "./living-school-types";
import { livingSchoolDemoEvents } from "./living-school-demo-data";
import { useTimeOfDay } from "./use-time-of-day";
import styles from "./living-school.module.css";

const periodLabels: Record<TimeOfDay, string> = {
  morning: "Утро",
  day: "День",
  evening: "Вечер",
  night: "Ночь",
};

const greetings: Record<TimeOfDay, string> = {
  morning: "Доброе утро, UK School",
  day: "Школа наполнена энергией",
  evening: "Добрый вечер, UK School",
  night: "Школа отдыхает и хранит свои знания",
};

type DetailPanel = "tree" | "heart" | null;

export default function LivingSchoolScene({ snapshot }: { snapshot: LivingSchoolSnapshot }) {
  const clock = useTimeOfDay();
  const period = clock?.period ?? "day";
  const [detail, setDetail] = useState<DetailPanel>(null);
  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [intro, setIntro] = useState(false);
  const [eventLocked, setEventLocked] = useState(false);
  const eventLockRef = useRef(false);
  const generatedLabel = useMemo(() => {
    const date = new Date(snapshot.generatedAt);
    return Number.isNaN(date.getTime()) ? "сейчас" : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }, [snapshot.generatedAt]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = sessionStorage.getItem("living-school-intro-seen");
    const startTimer = !seen && !reduced
      ? window.setTimeout(() => setIntro(true), 0)
      : undefined;
    sessionStorage.setItem("living-school-intro-seen", "1");
    return () => {
      if (startTimer !== undefined) window.clearTimeout(startTimer);
    };
  }, []);

  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => setIntro(false), 3000);
    return () => window.clearTimeout(timer);
  }, [intro]);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => {
      setEvent(null);
      setEventLocked(false);
      eventLockRef.current = false;
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [event]);

  useEffect(() => {
    if (!detail) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setDetail(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detail]);

  const atmosphere = useMemo(() => {
    if (event) return "Праздник";
    const names = { calm: "Спокойствие", inspired: "Вдохновение", active: "Энергия", celebrating: "Праздник" };
    return names[snapshot.atmosphere];
  }, [event, snapshot.atmosphere]);

  function startEvent() {
    if (eventLockRef.current || eventLocked) return;
    eventLockRef.current = true;
    setEventLocked(true);
    const next = livingSchoolDemoEvents[Math.floor(Math.random() * livingSchoolDemoEvents.length)];
    setEvent(next);
  }

  return (
    <main className={`${styles.world} ${styles[period]} ${event ? styles.celebrating : ""}`}>
      <Link className={styles.back} href="/" aria-label="Вернуться в школьный кабинет">← Кабинет</Link>

      <section className={styles.hud} aria-label="Состояние живой школы">
        <div className={styles.hudTitle}><span>UK SCHOOL OF TASHKENT</span><strong>Живая школа</strong></div>
        <div className={styles.hudStats}>
          <span><small>Режим</small><b>{periodLabels[period]} · {clock?.time ?? "--:--"}</b></span>
          <span><small>Энергия</small><b>{snapshot.schoolEnergy}%</b></span>
          <span><small>Дерево знаний</small><b>Уровень {snapshot.knowledgeTreeLevel}</b></span>
          <span><small>Хорошие события</small><b>{snapshot.positiveEventsToday}</b></span>
          <span><small>Атмосфера</small><b>{atmosphere}</b></span>
        </div>
      </section>

      <section className={styles.scene} aria-label="Цифровой школьный кампус">
        <Sky period={period} />
        <div className={styles.clouds} aria-hidden="true"><i/><i/><i/></div>
        <div className={styles.birds} aria-hidden="true">⌁　⌁</div>
        <div className={styles.horizon} aria-hidden="true" />
        <SchoolBuilding active={Boolean(event)} />
        <div className={styles.path} aria-hidden="true" />
        <div className={styles.lamps} aria-hidden="true"><i/><i/><i/><i/></div>
        <div className={styles.trees} aria-hidden="true"><i/><i/><i/><i/></div>
        <div className={styles.flag} aria-hidden="true"><span/></div>
        <KnowledgeTree snapshot={snapshot} active={Boolean(event)} onOpen={() => setDetail("tree")} />
        <SchoolHeart snapshot={snapshot} active={Boolean(event)} onOpen={() => setDetail("heart")} />
        <div className={styles.particles} aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div>
        <div className={styles.greeting}><span>{periodLabels[period]}</span><h1>{greetings[period]}</h1><p>Цифровой кампус живёт вместе со школой</p></div>
      </section>

      <div className={styles.controls}>
        <button onClick={startEvent} disabled={eventLocked}>
          <span aria-hidden="true">✦</span>{eventLocked ? "Событие идёт…" : "Запустить школьное событие"}
        </button>
        <small>{snapshot.dataMode === "live" ? "Агрегированные данные школы" : "Частичные агрегированные данные"} · обновлено {generatedLabel}</small>
      </div>

      {event && <div className={styles.toast} role="status"><span>✦</span><div><small>СОБЫТИЕ В ЖИВОЙ ШКОЛЕ</small><strong>{event.title}</strong></div></div>}
      {detail && <DetailsModal type={detail} snapshot={snapshot} onClose={() => setDetail(null)} />}
      {intro && <Intro onSkip={() => setIntro(false)} />}
    </main>
  );
}

function Sky({ period }: { period: TimeOfDay }) {
  return <div className={styles.sky} aria-hidden="true">
    <div className={styles.sun}/><div className={styles.moon}/>
    <div className={styles.stars}>{Array.from({ length: 14 }, (_, i) => <i key={i}/>)}</div>
    {period === "morning" && <div className={styles.mist}/>} 
  </div>;
}

function SchoolBuilding({ active }: { active: boolean }) {
  return <div className={`${styles.school} ${active ? styles.schoolActive : ""}`} aria-hidden="true">
    <div className={styles.schoolCrown}><span>UK</span></div>
    <div className={styles.schoolWing}>{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div>
    <div className={styles.schoolCenter}>
      <div className={styles.schoolName}>UK SCHOOL</div>
      <div className={styles.clock}>✦</div>
      <div className={styles.entrance}><i/><i/><i/></div>
    </div>
    <div className={`${styles.schoolWing} ${styles.rightWing}`}>{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div>
  </div>;
}

function KnowledgeTree({ snapshot, active, onOpen }: { snapshot: LivingSchoolSnapshot; active: boolean; onOpen: () => void }) {
  return <button className={`${styles.knowledgeTree} ${active ? styles.treeActive : ""}`} onClick={onOpen} aria-label={`Открыть Дерево знаний, уровень ${snapshot.knowledgeTreeLevel}`}>
    <span className={styles.treeCrown} aria-hidden="true"><i/><i/><i/><i/><i/><b>✦</b></span>
    <span className={styles.treeTrunk} aria-hidden="true"/>
    <span className={styles.objectLabel}><small>СИМВОЛ РАЗВИТИЯ</small><strong>Дерево знаний</strong><em>{snapshot.knowledgeTreeProgress}% до уровня {snapshot.knowledgeTreeLevel + 1}</em></span>
  </button>;
}

function SchoolHeart({ snapshot, active, onOpen }: { snapshot: LivingSchoolSnapshot; active: boolean; onOpen: () => void }) {
  return <button className={`${styles.heart} ${active ? styles.heartActive : ""}`} onClick={onOpen} aria-label={`Открыть Сердце школы, энергия ${snapshot.schoolEnergy}%`}>
    <span className={styles.heartCore} aria-hidden="true"><i/></span>
    <span className={styles.objectLabel}><small>ЦИФРОВОЕ ЯДРО</small><strong>Сердце школы</strong><em>Энергия {snapshot.schoolEnergy}%</em></span>
  </button>;
}

function DetailsModal({ type, snapshot, onClose }: { type: Exclude<DetailPanel, null>; snapshot: LivingSchoolSnapshot; onClose: () => void }) {
  const tree = type === "tree";
  return <div className={styles.modalBack} onMouseDown={onClose}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="living-school-dialog-title" onMouseDown={e => e.stopPropagation()}>
      <button className={styles.modalClose} onClick={onClose} aria-label="Закрыть">×</button>
      <span className={styles.modalKicker}>{tree ? "СИМВОЛ РАЗВИТИЯ" : "ЦИФРОВОЕ ЯДРО"}</span>
      <h2 id="living-school-dialog-title">{tree ? "Дерево знаний" : "Сердце школы"}</h2>
      <p>{tree ? "Дерево знаний растёт благодаря успехам учеников, выполненным заданиям, школьным проектам, достижениям и победам на олимпиадах." : "Сердце школы отражает общую активность и позитивную атмосферу цифрового кампуса."}</p>
      {tree ? <>
        <div className={styles.metrics}><span><small>Уровень</small><b>{snapshot.knowledgeTreeLevel}</b></span><span><small>Листья знаний</small><b>{snapshot.knowledgeTreeLeaves.toLocaleString("ru-RU")}</b></span><span><small>Золотые цветы</small><b>{snapshot.knowledgeTreeGoldenFlowers}</b></span></div>
        <div className={styles.progressText}><span>До следующего уровня</span><b>{snapshot.knowledgeTreeProgress}%</b></div><div className={styles.progress}><i style={{ width: `${snapshot.knowledgeTreeProgress}%` }}/></div>
      </> : <div className={styles.metrics}><span><small>Активных учеников сегодня</small><b>{snapshot.activeStudentsToday}</b></span><span><small>Активных учителей сегодня</small><b>{snapshot.activeTeachersToday}</b></span><span><small>Положительных оценок</small><b>{snapshot.positiveGradesToday}</b></span><span><small>Хороших событий</small><b>{snapshot.positiveEventsToday}</b></span><span><small>Достижений за неделю</small><b>{snapshot.weeklyAchievements}</b></span><span><small>Энергия школы</small><b>{snapshot.schoolEnergy}%</b></span></div>}
    </section>
  </div>;
}

function Intro({ onSkip }: { onSkip: () => void }) {
  return <div className={styles.intro} role="dialog" aria-modal="true" aria-label="Добро пожаловать в живую школу">
    <div className={styles.introMark}>UK</div><span>UK SCHOOL OF TASHKENT</span><h2>Добро пожаловать<br/>в живую школу</h2><p>Мир, где знания становятся энергией</p><button onClick={onSkip}>Пропустить</button>
  </div>;
}
