import { requireNinjaConnector, rememberNinjaConnectorVersions } from "@/modules/ninja/server/connector-auth";
import { after } from "next/server";
import { isTelemetryV2Enabled } from "@/modules/ninja/server/telemetry-v2-rollout";
import { safelyDrainTelemetryV2 } from "@/modules/ninja/server/telemetry-v2";
import { refreshNinjaTechnicalOperations } from "@/modules/ninja/server/technical-operation-processing";
import { refreshNinjaTransitionsFromLatestSnapshot } from "@/modules/ninja/server/transition-processing";
import { bootstrapNinjaBrokerBalance } from "@/modules/ninja/server/broker-balance-processing";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  if (isTelemetryV2Enabled(connector.connectorId)) after(() => safelyDrainTelemetryV2(connector.connectorId));
  // Older heartbeats had no body or JSON content-type. Keep that compatibility,
  // but authenticate first and never read an unbounded body.
  const input = await readNinjaJson(request, 4 * 1024, false);
  if (!input.ok && input.response.status !== 400) return input.response;
  const body = (input.ok && input.payload && typeof input.payload === "object" ? input.payload : {}) as {
    connectorVersion?: unknown;
    installedSourceVersion?: unknown;
  };
  try {
    // La versión debe registrarse aunque una tarea posterior de reconstrucción
    // falle. Así el diagnóstico no muestra una revisión anterior como actual.
    await rememberNinjaConnectorVersions(
      connector.connectorId,
      body.connectorVersion,
      body.installedSourceVersion,
    );
    // Primero reconstruimos las operaciones mientras todos los vínculos de cuenta
    // siguen disponibles. Recién después aplicamos quemados y cierres de vínculo.
    await bootstrapNinjaBrokerBalance(connector.connectorId);
    await refreshNinjaTechnicalOperations(connector.connectorId);
    await refreshNinjaTransitionsFromLatestSnapshot(connector.connectorId);
    return response({ accepted: true }, 202);
  } catch {
    console.error("NODAL_NINJA_INTAKE_UNAVAILABLE", { scope: "heartbeat" });
    return response({ accepted: false, error: "No se pudo completar la actualización. Se reintentará." }, 503);
  }
}
