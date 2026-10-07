import {
  connectorServiceUnavailableResponse,
  linkNinjaConnectorDestination,
  requireNinjaConnector,
} from "@/modules/ninja/server/connector-auth";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  const input = await readNinjaJson(request, 4 * 1024);
  if (!input.ok) return input.response;
  const body = input.payload;
  if (!body || typeof body !== "object" || !("code" in body) || typeof body.code !== "string") {
    return response({ error: "Código incompleto." }, 422);
  }
  try {
    const linked = await linkNinjaConnectorDestination(connector.connectorId, body.code);
    return linked ? response({ linked: true }, 201) : response({ error: "El código venció, ya fue usado o el destino ya está vinculado." }, 409);
  } catch {
    return connectorServiceUnavailableResponse();
  }
}
