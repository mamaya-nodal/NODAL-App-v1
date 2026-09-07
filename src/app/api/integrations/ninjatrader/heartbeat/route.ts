import { authenticateNinjaConnector, bearerToken, rememberNinjaConnectorVersion } from "@/modules/ninja/server/connector-auth";
import { bootstrapNinjaBrokerBalance } from "@/modules/ninja/server/broker-balance-processing";
import { refreshNinjaTechnicalOperations } from "@/modules/ninja/server/technical-operation-processing";
import { bootstrapNinjaTransitions } from "@/modules/ninja/server/transition-processing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { connectorVersion?: unknown };
  const connector = await authenticateNinjaConnector(bearerToken(request));
  if (connector) {
    await Promise.all([
      bootstrapNinjaTransitions(connector.connectorId),
      bootstrapNinjaBrokerBalance(connector.connectorId),
      refreshNinjaTechnicalOperations(connector.connectorId),
      rememberNinjaConnectorVersion(connector.connectorId, body.connectorVersion),
    ]);
  }
  return Response.json(
    connector ? { accepted: true } : { error: "El conector no está autorizado." },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: connector ? 202 : 401 },
  );
}
