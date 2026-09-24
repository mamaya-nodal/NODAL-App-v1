"use client";

import { useEffect } from "react";

import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";

type Props = Readonly<{
  identityReviewRevision?: string;
  inventoryRevision?: string;
  linked?: boolean;
  online: boolean;
}>;

export function NinjaConnectorMonitor({ identityReviewRevision, inventoryRevision, linked = true, online }: Props) {
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/integrations/ninjatrader/status", { cache: "no-store" });
        const result = await response.json() as Partial<NinjaStatusEventDetail>;
        if (active && response.ok) {
          window.dispatchEvent(new CustomEvent<NinjaStatusEventDetail>(NINJA_STATUS_EVENT, {
            detail: {
              inventoryRevision: result.inventoryRevision ?? null,
              linked: Boolean(result.linked),
              liveBrokerBalance: result.liveBrokerBalance ?? null,
              online: Boolean(result.online),
            },
          }));
        }
        const inventoryChanged = inventoryRevision !== undefined &&
          typeof result.inventoryRevision === "string" &&
          result.inventoryRevision !== inventoryRevision;
        const identityReviewChanged = identityReviewRevision !== undefined &&
          typeof result.identityReviewRevision === "string" &&
          result.identityReviewRevision !== identityReviewRevision;
        if (active && response.ok && (Boolean(result.linked) !== linked || Boolean(result.online) !== online || inventoryChanged || identityReviewChanged)) {
          // Una recarga completa conserva el hash de la sección activa. El refresh
          // del router puede reconstruir la URL del servidor sin ese fragmento.
          window.location.reload();
        }
      } catch {
        // Una falla transitoria de red no cambia por sí sola el estado visible.
      }
    };
    void check();
    const interval = window.setInterval(check, 5_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [identityReviewRevision, inventoryRevision, linked, online]);

  return null;
}
