"use client";

import { useEffect } from "react";

export default function PresenceHeartbeat() {
  useEffect(() => {
    let disposed = false;

    const beat = () => {
      if (disposed || document.visibilityState === "hidden") return;
      void fetch("/api/presence/heartbeat", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    };

    beat();
    const timer = window.setInterval(beat, 60_000);
    window.addEventListener("focus", beat);
    document.addEventListener("visibilitychange", beat);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", beat);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
