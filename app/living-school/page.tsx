"use client";

import { useEffect, useState } from "react";
import type { SchoolUser } from "../../db/accounts";
import LivingSchoolScene from "./LivingSchoolScene";
import { livingSchoolDemoSnapshot } from "./living-school-demo-data";
import styles from "./living-school.module.css";

export default function LivingSchoolPage() {
  const [profile, setProfile] = useState<SchoolUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { signal: controller.signal })
      .then(response => response.json())
      .then(data => {
        if (!data.profile) window.location.replace("/");
        else setProfile(data.profile);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        window.location.replace("/");
      })
      .finally(() => setChecking(false));
    return () => controller.abort();
  }, []);

  if (checking || !profile) return <main className={styles.accessCheck}><span>UK</span><p>Открываем Живую школу…</p></main>;
  return <LivingSchoolScene snapshot={livingSchoolDemoSnapshot}/>;
}

