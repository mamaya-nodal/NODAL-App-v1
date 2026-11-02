"use client";

import { useEffect } from "react";

const INTERVAL_MS = 60_000;

export function AppPresenceMonitor() {
  useEffect(() => {
    const send = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/app-presence", { cache: "no-store", method: "POST" });
    };
    send();
    const interval = window.setInterval(send, INTERVAL_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", send);
    };
  }, []);

  return null;
}
