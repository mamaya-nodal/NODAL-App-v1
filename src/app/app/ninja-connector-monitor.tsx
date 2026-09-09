"use client";

import { useEffect } from "react";

import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";

export function NinjaConnectorMonitor({ online }: Readonly<{ online: boolean }>) {
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/integrations/ninjatrader/status", { cache: "no-store" });
        const result = await response.json() as Partial<NinjaStatusEventDetail>;
        if (active && response.ok) {
          window.dispatchEvent(new CustomEvent<NinjaStatusEventDetail>(NINJA_STATUS_EVENT, {
            detail: {
              liveBrokerBalance: result.liveBrokerBalance ?? null,
              online: Boolean(result.online),
            },
          }));
        }
        if (active && response.ok && Boolean(result.online) !== online) {
          // Una recarga completa conserva el hash de la sección activa. El refresh
          // del router puede reconstruir la URL del servidor sin ese fragmento.
          window.location.reload();
        }
      } catch {
        // Una falla transitoria de red no cambia por sí sola el estado visible.
      }
    };
    void check();
    const interval = window.setInterval(check, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [online]);

  return null;
}
