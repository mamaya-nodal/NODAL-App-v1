import {
  getNinjaSnapshotSummary,
  isNinjaInventorySnapshot,
  normalizeNinjaInventorySnapshot,
} from "@/modules/ninja/domain/ingestion-payload";
import { rememberLocalNinjaSnapshot } from "@/modules/ninja/server/local-snapshot-store";
import { persistNinjaSnapshot } from "@/modules/ninja/server/snapshot-persistence";
import { processNinjaTransitions } from "@/modules/ninja/server/transition-processing";
import { ensureNinjaBrokerBalanceBaseline } from "@/modules/ninja/server/broker-balance-processing";
import { requireNinjaConnector } from "@/modules/ninja/server/connector-auth";
import { routeNinjaInventory } from "@/modules/ninja/server/intake-routing";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumPayloadBytes = 128 * 1024;

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;

  const input = await readNinjaJson(request, maximumPayloadBytes);
  if (!input.ok) return input.response;
  if (!isNinjaInventorySnapshot(input.payload)) {
    return response({ error: "La actualización de Ninja no cumple el formato esperado." }, 422);
  }
  const payload = normalizeNinjaInventorySnapshot(input.payload);

  try {
    const summary = getNinjaSnapshotSummary(payload);
    const routed = await routeNinjaInventory(connector.connectorId, payload);
    if (routed === null) return response({ error: "No se pudo resolver el destino de la señal." }, 503);
    const results = await Promise.all(routed.map(async ({ destinationConnectorId, snapshot }) => {
      if (process.env.NEXT_PUBLIC_APP_ENV === "local") rememberLocalNinjaSnapshot(destinationConnectorId, snapshot);
      const persistence = await persistNinjaSnapshot(destinationConnectorId, snapshot, connector.connectorId);
      if (!persistence.persisted) return persistence;
      await Promise.all([
        processNinjaTransitions(destinationConnectorId, snapshot),
        ensureNinjaBrokerBalanceBaseline(destinationConnectorId, snapshot),
      ]);
      return persistence;
    }));
    const accepted = results.every((result) => result.persisted);

    // Keep operational identifiers and downstream processing details out of logs/responses.
    console.info("NinjaTrader inventory received", summary);

    return response(
      { accepted, destinations: routed.length, persisted: accepted, summary },
      accepted ? 202 : 503,
    );
  } catch {
    console.error("NODAL_NINJA_INTAKE_UNAVAILABLE", { scope: "inventory" });
    return response({ accepted: false, error: "No se pudo completar la recepción. Se reintentará." }, 503);
  }
}
