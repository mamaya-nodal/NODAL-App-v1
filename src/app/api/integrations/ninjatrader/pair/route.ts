import { pairNinjaConnector, connectorServiceUnavailableResponse } from "@/modules/ninja/server/connector-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: object, status: number) {
  return Response.json(body, { headers: { "Cache-Control": "no-store, max-age=0" }, status });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return response({ error: "Formato no válido." }, 415);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4 * 1024) return response({ error: "Solicitud demasiado grande." }, 413);
    body = JSON.parse(raw) as unknown;
  } catch {
    return response({ error: "No se pudo leer la vinculación." }, 400);
  }

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
