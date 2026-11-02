import { connectorVersionState } from "@/modules/ninja/domain/connector-version";

const LIVE_SIGNAL_WINDOW_MS = 5 * 60 * 1_000;
const APP_PRESENCE_WINDOW_MS = 2 * 60 * 1_000;

export type TraderLiveLight = "blue" | "gray" | "green" | "orange" | "red" | "yellow";

export type TraderLiveStatus = Readonly<{
  light: TraderLiveLight;
  message: string;
}>;

type Connector = Readonly<{
  connectorVersion: string | null;
  lastSeenAt: string | null;
  status: string;
}>;

function isRecent(value: string | null, windowMs: number, now: Date) {
  if (!value) return false;
  const elapsed = now.getTime() - Date.parse(value);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= windowMs;
}

export function resolveTraderLiveStatus(input: Readonly<{
  appLastSeenAt: string | null;
  connectors: readonly Connector[];
  hasOpenOperation: boolean;
  now?: Date;
}>): TraderLiveStatus {
  const now = input.now ?? new Date();
  const active = input.connectors.filter((connector) => connector.status === "active");
  const current = active.filter((connector) => connectorVersionState({
    installedSourceVersion: null,
    runningVersion: connector.connectorVersion,
  }) === "current");

  if (!current.length) {
    return {
      light: "red",
      message: active.length
        ? "Conector desactualizado o pendiente de activación."
        : "No tiene un conector NODAL activo.",
    };
  }

  const receivingSignal = current.some((connector) => isRecent(connector.lastSeenAt, LIVE_SIGNAL_WINDOW_MS, now));
  if (!receivingSignal) {
    return input.hasOpenOperation
      ? { light: "orange", message: "Se perdió la señal mientras había una operación abierta." }
      : { light: "gray", message: "Configurado, sin señal reciente de NinjaTrader y sin operación abierta." };
  }

  if (!input.hasOpenOperation) {
    return { light: "blue", message: "Conector actualizado y transmitiendo. No hay operación abierta." };
  }

  return isRecent(input.appLastSeenAt, APP_PRESENCE_WINDOW_MS, now)
    ? { light: "green", message: "Conector transmitiendo, operación abierta y app NODAL activa." }
    : { light: "yellow", message: "Conector transmitiendo y operación abierta; la app NODAL no está abierta ahora." };
}
