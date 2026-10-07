import { after } from "next/server";
import { isTelemetryV2Enabled } from "@/modules/ninja/server/telemetry-v2-rollout";
import { requireNinjaConnector } from "@/modules/ninja/server/connector-auth";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";
import { parseTelemetryV2, receiveTelemetryV2, safelyDrainTelemetryV2 } from "@/modules/ninja/server/telemetry-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  if (!isTelemetryV2Enabled(connector.connectorId)) return response({ error: "Recepción v2 no habilitada." }, 503);
  const input = await readNinjaJson(request, 512 * 1024);
  if (!input.ok) return input.response;
  const batch = parseTelemetryV2(input.payload);
  if (!batch) return response({ error: "Lote v2 inválido." }, 422);
  try {
    const receipts = await receiveTelemetryV2(connector.connectorId, batch.events);
    after(() => safelyDrainTelemetryV2(connector.connectorId));
    return response({ protocol: 2, batchId: batch.batchId, receipts }, 200);
  } catch {
    console.error("NODAL_NINJA_V2_INTAKE_UNAVAILABLE");
    return response({ error: "Recepción pendiente. Conservar y reintentar." }, 503);
  }
}
