"use client";

import { useEffect, useState } from "react";
import LivingSchoolScene from "./LivingSchoolScene";
import type { LivingSchoolSnapshot } from "./living-school-types";
import styles from "./living-school.module.css";

function emptySnapshot(): LivingSchoolSnapshot {
  return {
    activeStudentsToday: 0,
    activeTeachersToday: 0,
    positiveGradesToday: 0,
    positiveEventsToday: 0,
    weeklyAchievements: 0,
    schoolEnergy: 0,
    knowledgeTreeLevel: 1,
    knowledgeTreeLeaves: 0,
    knowledgeTreeGoldenFlowers: 0,
    knowledgeTreeProgress: 0,
    atmosphere: "calm",
    generatedAt: new Date().toISOString(),
    dataMode: "partial",
  };
}

export default function LivingSchoolPage() {
  const [snapshot, setSnapshot] = useState<LivingSchoolSnapshot | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/living-school/snapshot", {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async response => {
        if (response.status === 401) {
          window.location.replace("/");
          return null;
        }
        if (!response.ok) throw new Error("Snapshot unavailable");
        return response.json() as Promise<LivingSchoolSnapshot>;
      })
      .then(data => {
        if (data) setSnapshot(data);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSnapshot(emptySnapshot());
      })
      .finally(() => setChecking(false));
    return () => controller.abort();
  }, []);

  if (checking || !snapshot) return <main className={styles.accessCheck}><span>UK</span><p>Открываем Живую школу…</p></main>;
  return <LivingSchoolScene snapshot={snapshot}/>;
}
