"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function NinjaConnectorMonitor({ online }: Readonly<{ online: boolean }>) {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/integrations/ninjatrader/status", { cache: "no-store" });
        const result = await response.json() as { online?: boolean };
        if (active && response.ok && Boolean(result.online) !== online) router.refresh();
      } catch {
        // Una falla transitoria de red no cambia por sí sola el estado visible.
      }
    };
    const interval = window.setInterval(check, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [online, router]);

  return null;
}
