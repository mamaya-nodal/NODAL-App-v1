import {
  connectorServiceUnavailableResponse,
  linkNinjaConnectorDestination,
  requireNinjaConnector,
} from "@/modules/ninja/server/connector-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: object, status: number) {
  return Response.json(body, { headers: { "Cache-Control": "no-store, max-age=0" }, status });
}

export async function POST(request: Request) {
  const connector = await requireNinjaConnector(request);
  if (connector instanceof Response) return connector;
  if (!request.headers.get("content-type")?.includes("application/json")) return response({ error: "Formato no válido." }, 415);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4096) return response({ error: "Solicitud demasiado grande." }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (typeof body.code !== "string") return response({ error: "Código incompleto." }, 422);
    const linked = await linkNinjaConnectorDestination(connector.connectorId, body.code);
    return linked ? response({ linked: true }, 201) : response({ error: "El código venció, ya fue usado o el destino ya está vinculado." }, 409);
  } catch (error) {
    return error instanceof SyntaxError
      ? response({ error: "No se pudo leer la vinculación." }, 400)
      : connectorServiceUnavailableResponse();
  }
}
