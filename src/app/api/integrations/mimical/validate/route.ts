import { MimicalServiceUnavailable, validateMimical } from "@/modules/addons/server/mimical-auth";
import { bearerToken } from "@/modules/ninja/server/connector-auth";
import { ninjaIntakeResponse as response, readNinjaJson } from "@/modules/ninja/server/intake-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = await readNinjaJson(request, 2 * 1024);
  if (!input.ok) return input.response;
  const body = input.payload as Record<string, unknown> | null;
  if (!body || typeof body.installationKey !== "string") return response({ error: "Datos incompletos." }, 422);
  try {
    const validation = await validateMimical(bearerToken(request) ?? "", body.installationKey);
    return validation ? response(validation, 200) : response({ allowNewCycles: false, error: "MIMICAL no está autorizado." }, 401);
  } catch (error) {
    if (error instanceof MimicalServiceUnavailable) return response({ allowNewCycles: false, error: "No se pudo verificar la licencia." }, 503);
    throw error;
  }
}
