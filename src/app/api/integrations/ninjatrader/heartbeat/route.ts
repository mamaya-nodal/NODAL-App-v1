import { requireNinjaConnector, rememberNinjaConnectorVersions } from "@/modules/ninja/server/connector-auth";
import { after } from "next/server";
import { isTelemetryV2Enabled } from "@/modules/ninja/server/telemetry-v2-rollout";
import { safelyDrainTelemetryV2 } from "@/modules/ninja/server/telemetry-v2";
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
    // El heartbeat sólo confirma presencia y versión. Inventario y telemetría
    // ya procesan saldos, operaciones y transiciones al recibir datos; repetir
    // una reconstrucción completa en cada latido satura la base y puede impedir
    // que los usuarios abran la aplicación.
    await rememberNinjaConnectorVersions(
      connector.connectorId,
      body.connectorVersion,
      body.installedSourceVersion,
    );
    return response({ accepted: true }, 202);
  } catch {
    console.error("NODAL_NINJA_INTAKE_UNAVAILABLE", { scope: "heartbeat" });
    return response({ accepted: false, error: "No se pudo completar la actualización. Se reintentará." }, 503);
  }
}
