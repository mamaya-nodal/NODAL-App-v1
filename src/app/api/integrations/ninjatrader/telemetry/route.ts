import { isNinjaTradeTelemetryBatch } from "@/modules/ninja/domain/trade-telemetry";
import { requireNinjaConnector } from "@/modules/ninja/server/connector-auth";
import { persistNinjaTradeTelemetry } from "@/modules/ninja/server/telemetry-persistence";
import { refreshNinjaTechnicalOperations } from "@/modules/ninja/server/technical-operation-processing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumPayloadBytes = 256 * 1024;

function response(body: object, status: number) {
  return Response.json(body, { headers: { "Cache-Control": "no-store, max-age=0" }, status });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return response({ error: "La sesión no está autorizada." }, 401);
  const [eventsResult, operationsResult, batchesResult] = await Promise.all([
    supabase.rpc("get_current_user_ninja_trade_telemetry", { target_limit: 200 }),
    supabase.rpc("get_current_user_ninja_operation_probe_sessions", { target_limit: 20 }),
    supabase.rpc("get_current_user_ninja_operation_batches", { target_limit: 30 }),
  ]);
  return eventsResult.error || operationsResult.error || batchesResult.error
    ? response({ error: "No se pudo consultar la prueba." }, 503)
    : response({ batches: batchesResult.data ?? [], events: eventsResult.data ?? [], operations: operationsResult.data ?? [] }, 200);
}

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return response({ error: "El formato recibido no es válido." }, 415);
  }
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > maximumPayloadBytes) {
    return response({ error: "La telemetría recibida es demasiado grande." }, 413);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > maximumPayloadBytes) {
      return response({ error: "La telemetría recibida es demasiado grande." }, 413);
    }
    payload = JSON.parse(body) as unknown;
  } catch {
    return response({ error: "No se pudo leer la telemetría de Ninja." }, 400);
  }
  if (!isNinjaTradeTelemetryBatch(payload)) {
    return response({ error: "La telemetría no cumple el formato esperado." }, 422);
  }

  // The actual version is supplied at pairing/heartbeat, not inferred here.
  const persistence = await persistNinjaTradeTelemetry(connector.connectorId, payload);
  if (persistence.persisted && persistence.acceptedEvents > 0) {
    await refreshNinjaTechnicalOperations(connector.connectorId);
  }
  return response({
    accepted: persistence.persisted,
    acceptedEvents: persistence.acceptedEvents,
    batchId: payload.batchId,
    persistenceReason: persistence.persisted ? undefined : persistence.reason,
  }, persistence.persisted ? 202 : 503);
}
