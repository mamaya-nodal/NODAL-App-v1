import {
  getNinjaSnapshotSummary,
  isNinjaInventorySnapshot,
} from "@/modules/ninja/domain/ingestion-payload";
import { rememberLocalNinjaSnapshot } from "@/modules/ninja/server/local-snapshot-store";
import { persistNinjaSnapshot } from "@/modules/ninja/server/snapshot-persistence";
import { processNinjaTransitions } from "@/modules/ninja/server/transition-processing";
import { ensureNinjaBrokerBalanceBaseline } from "@/modules/ninja/server/broker-balance-processing";
import { requireNinjaConnector } from "@/modules/ninja/server/connector-auth";
import { routeNinjaInventory } from "@/modules/ninja/server/intake-routing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumPayloadBytes = 128 * 1024;

function response(body: object, status: number) {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status,
  });
}

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return response({ error: "El formato recibido no es válido." }, 415);
  }

  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > maximumPayloadBytes) {
    return response({ error: "La actualización recibida es demasiado grande." }, 413);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > maximumPayloadBytes) {
      return response({ error: "La actualización recibida es demasiado grande." }, 413);
    }
    payload = JSON.parse(body) as unknown;
  } catch {
    return response({ error: "No se pudo leer la actualización de Ninja." }, 400);
  }

  if (!isNinjaInventorySnapshot(payload)) {
    return response({ error: "La actualización de Ninja no cumple el formato esperado." }, 422);
  }

  const summary = getNinjaSnapshotSummary(payload);
  const routed = await routeNinjaInventory(connector.connectorId, payload);
  if (routed === null) return response({ error: "No se pudo resolver el destino de la señal." }, 503);
  const results = await Promise.all(routed.map(async ({ destinationConnectorId, snapshot }) => {
    if (process.env.NEXT_PUBLIC_APP_ENV === "local") rememberLocalNinjaSnapshot(destinationConnectorId, snapshot);
    const persistence = await persistNinjaSnapshot(destinationConnectorId, snapshot, connector.connectorId);
    if (!persistence.persisted) return { persistence };
    const [transitions, brokerBaseline] = await Promise.all([
      processNinjaTransitions(destinationConnectorId, snapshot),
      ensureNinjaBrokerBalanceBaseline(destinationConnectorId, snapshot),
    ]);
    return { brokerBaseline, persistence, transitions };
  }));
  const accepted = results.every((result) => result.persistence.persisted);

  // El inventario técnico se conserva para detección y revisión. Este receptor
  // no crea por sí solo compras ni movimientos económicos.
  console.info("NinjaTrader inventory received", summary);

  return response(
    {
      accepted,
      destinations: routed.length,
      persisted: accepted,
      summary,
      results,
    },
    accepted ? 202 : 503,
  );
}
