"use client";

import { useEffect, useState } from "react";
import type { TimeOfDay } from "./living-school-types";

function getTimeOfDay(date: Date): TimeOfDay {
  const hourPart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart ?? 12);
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export function useTimeOfDay() {
  const [state, setState] = useState<{ period: TimeOfDay; time: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      const now = new Date();
      setState({
        period: getTimeOfDay(now),
        time: now.toLocaleTimeString("ru-RU", {
          timeZone: "Asia/Tashkent",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
      if (document.visibilityState === "visible") {
        timer = setTimeout(update, 60_000);
      }
    };
    const onVisibility = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (document.visibilityState === "visible") update();
    };

    update();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return state;
}
