"use client";

import { useEffect } from "react";

import { NINJA_STATUS_EVENT, type NinjaStatusEventDetail } from "./ninja-status-event";

const STATUS_POLL_INTERVAL_MS = 15_000;
const STATUS_REQUEST_TIMEOUT_MS = 8_000;

type Props = Readonly<{
  inventoryRevision?: string;
  linked?: boolean;
  online: boolean;
  refreshOnChange?: boolean;
}>;

export function shouldReloadForNinjaStatus(input: Readonly<{
  connectionChanged: boolean;
  inventoryChanged: boolean;
  refreshOnConnectionChange: boolean;
}>) {
  return input.inventoryChanged || (input.refreshOnConnectionChange && input.connectionChanged);
}

export function NinjaConnectorMonitor({ inventoryRevision, linked = true, online, refreshOnChange = true }: Props) {
  useEffect(() => {
    let active = true;
    let running = false;
    let timer: number | undefined;

    const schedule = () => {
      if (!active || document.visibilityState !== "visible") return;
      timer = window.setTimeout(check, STATUS_POLL_INTERVAL_MS);
    };

    const check = async () => {
      if (!active || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const response = await fetch("/api/integrations/ninjatrader/status", {
          cache: "no-store",
          signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
        });
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
        const connectionChanged = Boolean(result.linked) !== linked || Boolean(result.online) !== online;
        if (active && response.ok && shouldReloadForNinjaStatus({
          connectionChanged,
          inventoryChanged,
          refreshOnConnectionChange: refreshOnChange,
        })) {
          // Una recarga completa conserva el hash de la sección activa. El refresh
          // del router puede reconstruir la URL del servidor sin ese fragmento.
          window.location.reload();
        }
      } catch {
        // Una falla transitoria de red no cambia por sí sola el estado visible.
      } finally {
        running = false;
        schedule();
      }
    };

    const wake = () => {
      if (!active || running || document.visibilityState !== "visible") return;
      if (timer !== undefined) window.clearTimeout(timer);
      void check();
    };

    // La primera lectura ya llegó con la página. Evitamos duplicarla durante
    // la apertura y sólo comprobamos cambios después del primer intervalo.
    schedule();
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [inventoryRevision, linked, online, refreshOnChange]);

  return null;
}
