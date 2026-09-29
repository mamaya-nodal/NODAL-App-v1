import { requireNinjaConnector, rememberNinjaConnectorVersion } from "@/modules/ninja/server/connector-auth";
import { refreshNinjaTechnicalOperations } from "@/modules/ninja/server/technical-operation-processing";
import { refreshNinjaTransitionsFromLatestSnapshot } from "@/modules/ninja/server/transition-processing";
import { bootstrapNinjaBrokerBalance } from "@/modules/ninja/server/broker-balance-processing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { connectorVersion?: unknown };
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  // Primero reconstruimos las operaciones mientras todos los vinculos de cuenta
  // siguen disponibles. Recién después aplicamos quemados y cierres de vínculo.
  await bootstrapNinjaBrokerBalance(connector.connectorId);
  await refreshNinjaTechnicalOperations(connector.connectorId);
  await Promise.all([
    refreshNinjaTransitionsFromLatestSnapshot(connector.connectorId),
    rememberNinjaConnectorVersion(connector.connectorId, body.connectorVersion),
  ]);
  return Response.json(
    { accepted: true },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: 202 },
  );
}
