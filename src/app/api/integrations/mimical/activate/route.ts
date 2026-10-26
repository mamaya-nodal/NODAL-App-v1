import { activateMimical, MimicalServiceUnavailable } from "@/modules/addons/server/mimical-auth";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await readNinjaJson(request, 4 * 1024);
  if (!input.ok) return input.response;
  const body = input.payload as Record<string, unknown> | null;
  if (!body || typeof body.code !== "string" || typeof body.installationKey !== "string" || typeof body.mimicalVersion !== "string") {
    return response({ error: "Datos incompletos." }, 422);
  }
  try {
    const activation = await activateMimical({ code: body.code, installationKey: body.installationKey, mimicalVersion: body.mimicalVersion });
    return activation ? response(activation, 201) : response({ error: "El código es inválido, venció o ya fue utilizado." }, 401);
  } catch (error) {
    if (error instanceof MimicalServiceUnavailable) return response({ error: "NODAL no pudo verificar la licencia." }, 503);
    throw error;
  }
}
