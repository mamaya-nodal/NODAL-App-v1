import { isNinjaTradeTelemetryBatch } from "@/modules/ninja/domain/trade-telemetry";
import { authenticateNinjaConnector, bearerToken, rememberNinjaConnectorVersion } from "@/modules/ninja/server/connector-auth";
import { persistNinjaTradeTelemetry } from "@/modules/ninja/server/telemetry-persistence";
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
  const { data, error } = await supabase.rpc("get_current_user_ninja_trade_telemetry", { target_limit: 200 });
  return error
    ? response({ error: "No se pudo consultar la prueba." }, 503)
    : response({ events: data ?? [] }, 200);
}

export async function POST(request: Request) {
  const connector = await authenticateNinjaConnector(bearerToken(request));
  if (!connector) return response({ error: "El conector no está autorizado." }, 401);
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

  const [persistence] = await Promise.all([
    persistNinjaTradeTelemetry(connector.connectorId, payload),
    // La telemetría de operaciones nació con la versión 0.4. Esto también
    // corrige instalaciones actualizadas antes de que el latido informara versión.
    rememberNinjaConnectorVersion(connector.connectorId, "0.4"),
  ]);
  return response({
    accepted: persistence.persisted,
    acceptedEvents: persistence.acceptedEvents,
    batchId: payload.batchId,
    persistenceReason: persistence.persisted ? undefined : persistence.reason,
  }, persistence.persisted ? 202 : 503);
}
