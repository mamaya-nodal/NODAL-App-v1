import { pairNinjaConnector, connectorServiceUnavailableResponse } from "@/modules/ninja/server/connector-auth";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await readNinjaJson(request, 4 * 1024);
  if (!input.ok) return input.response;
  const body = input.payload;

  if (!body || typeof body !== "object") return response({ error: "Datos incompletos." }, 422);
  const values = body as Record<string, unknown>;
  if (typeof values.code !== "string" || typeof values.connectorVersion !== "string") {
    return response({ error: "Datos incompletos." }, 422);
  }

  try {
    const session = await pairNinjaConnector(values.code, values.connectorVersion);
    return session
      ? response(session, 201)
      : response({ error: "El código es inválido, venció o ya fue utilizado." }, 401);
  } catch {
    return connectorServiceUnavailableResponse();
  }
}
