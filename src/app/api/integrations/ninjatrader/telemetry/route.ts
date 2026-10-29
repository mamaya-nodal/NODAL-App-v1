import { isNinjaTradeTelemetryBatch, normalizeNinjaTradeTelemetryBatch } from "@/modules/ninja/domain/trade-telemetry";
import { requireNinjaConnector } from "@/modules/ninja/server/connector-auth";
import { persistNinjaTradeTelemetry } from "@/modules/ninja/server/telemetry-persistence";
import { refreshNinjaTechnicalOperations } from "@/modules/ninja/server/technical-operation-processing";
import { createClient } from "@/lib/supabase/server";
import { routeNinjaTelemetry } from "@/modules/ninja/server/intake-routing";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";
import { readOpeningBrokerState } from "@/modules/ninja/server/opening-broker-state";
import { filterNinjaTelemetryReadScope } from "@/modules/ninja/domain/telemetry-read-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumPayloadBytes = 256 * 1024;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return response({ error: "La sesión no está autorizada." }, 401);
  try {
    const [eventsResult, operationsResult, batchesResult, brokerState, exclusionsResult] = await Promise.all([
      supabase.rpc("get_current_user_ninja_trade_telemetry", { target_limit: 200 }),
      supabase.rpc("get_current_user_ninja_operation_probe_sessions", { target_limit: 20 }),
      supabase.rpc("get_current_user_ninja_reconciliation_details", { target_limit: 500 }),
      readOpeningBrokerState(supabase, user.id),
      supabase.from("ninja_broker_account_exclusions").select("account_name").eq("owner_user_id", user.id),
    ]);
    if (eventsResult.error || operationsResult.error || batchesResult.error || exclusionsResult.error) {
      return response({ error: "No se pudo consultar la prueba." }, 503);
    }
    const scoped = filterNinjaTelemetryReadScope({
      batches: batchesResult.data ?? [],
      events: eventsResult.data ?? [],
      hiddenBrokerAccountNames: [
        ...brokerState.pendingAccounts.map((account) => account.accountName),
        ...(exclusionsResult.data ?? []).map((account) => account.account_name),
      ],
      operations: operationsResult.data ?? [],
    });
    return response(scoped, 200);
  } catch {
    return response({ error: "No se pudo consultar la prueba." }, 503);
  }
}

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  const input = await readNinjaJson(request, maximumPayloadBytes);
  if (!input.ok) return input.response;
  if (!isNinjaTradeTelemetryBatch(input.payload)) {
    return response({ error: "La telemetría no cumple el formato esperado." }, 422);
  }
  const payload = normalizeNinjaTradeTelemetryBatch(input.payload);

  try {
    // The actual version is supplied at pairing/heartbeat, not inferred here.
    const routed = await routeNinjaTelemetry(connector.connectorId, payload);
    if (routed === null) return response({ error: "No se pudo resolver el destino de la señal." }, 503);
    const results = await Promise.all(routed.map(async ({ batch, destinationConnectorId }) => {
      const persistence = await persistNinjaTradeTelemetry(destinationConnectorId, batch);
      if (persistence.persisted && persistence.acceptedEvents > 0) await refreshNinjaTechnicalOperations(destinationConnectorId);
      return persistence;
    }));
    const persisted = results.every((result) => result.persisted);
    return response({
      accepted: persisted,
      acceptedEvents: results.reduce((sum, result) => sum + result.acceptedEvents, 0),
      batchId: payload.batchId,
      destinations: routed.length,
    }, persisted ? 202 : 503);
  } catch {
    console.error("NODAL_NINJA_INTAKE_UNAVAILABLE", { scope: "telemetry" });
    return response({ accepted: false, error: "No se pudo completar la recepción. Se reintentará." }, 503);
  }
}
