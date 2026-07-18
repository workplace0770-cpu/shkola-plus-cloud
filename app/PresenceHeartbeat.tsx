"use client";

import { useEffect } from "react";

const PERIODIC_MINIMUM_MS = 5 * 60_000;
// A small scheduling margin prevents the interval from firing a few milliseconds
// before the five-minute boundary and postponing the next heartbeat by 5 minutes.
const HEARTBEAT_INTERVAL_MS = PERIODIC_MINIMUM_MS + 1_000;
const FOCUS_MINIMUM_MS = 4 * 60_000;
const PRESENCE_CHANNEL = "school-presence-heartbeat";

export default function PresenceHeartbeat() {
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let lastSuccessfulAt = 0;
    const channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(PRESENCE_CHANNEL);

    const beat = async (minimumElapsedMs: number) => {
      const now = Date.now();
      if (
        disposed ||
        inFlight ||
        document.visibilityState === "hidden" ||
        now - lastSuccessfulAt < minimumElapsedMs
      ) return;

      inFlight = true;
      try {
        const response = await fetch("/api/presence/heartbeat", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          keepalive: true,
        });
        if (!disposed && response.ok) {
          lastSuccessfulAt = Date.now();
          channel?.postMessage({ type: "success", at: lastSuccessfulAt });
        }
      } catch {
        // A later interval or focus event retries without disturbing the UI.
      } finally {
        inFlight = false;
      }
    };

    const onChannelMessage = (event: MessageEvent) => {
      if (event.data?.type !== "success") return;
      const timestamp = Number(event.data.at);
      if (Number.isFinite(timestamp)) {
        lastSuccessfulAt = Math.max(lastSuccessfulAt, timestamp);
      }
    };
    const onFocus = () => void beat(FOCUS_MINIMUM_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void beat(FOCUS_MINIMUM_MS);
      }
    };

    channel?.addEventListener("message", onChannelMessage);
    void beat(0);
    const timer = window.setInterval(
      () => void beat(PERIODIC_MINIMUM_MS),
      HEARTBEAT_INTERVAL_MS,
    );
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      channel?.removeEventListener("message", onChannelMessage);
      channel?.close();
    };
  }, []);

  return null;
}
