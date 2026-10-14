import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(message: string, ok: boolean, status: number, restoredCount = 0) {
  return Response.json(
    { message, ok, restoredCount },
    { headers: { "Cache-Control": "no-store" }, status },
  );
}

export async function POST(request: Request) {
  let connectorId = "";
  try {
    const payload = await request.json() as { connectorId?: unknown };
    connectorId = typeof payload.connectorId === "string" ? payload.connectorId.trim() : "";
  } catch {
    return response("No pudimos identificar el conector.", false, 400);
  }
  if (!UUID_PATTERN.test(connectorId)) {
    return response("No pudimos identificar el conector.", false, 400);
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      return response("La sesión venció. Volvé a ingresar.", false, 401);
    }

    const { data, error } = await supabase.rpc(
      "restore_current_user_ninja_account_registration_exclusions",
      { target_connector_id: connectorId },
    );
    if (error?.message.includes("ninja_connector_not_available")) {
      return response("El conector ya no está disponible.", false, 409);
    }
    if (error) {
      return response("No pudimos actualizar las cuentas detectadas.", false, 500);
    }

    const restoredCount = Number(data ?? 0);
    const message = restoredCount > 0
      ? restoredCount === 1
        ? "La cuenta eliminada volvió a quedar disponible para registrar."
        : `${restoredCount} cuentas eliminadas volvieron a quedar disponibles para registrar.`
      : "Listado actualizado con la última información de NinjaTrader.";
    return response(message, true, 200, restoredCount);
  } catch {
    return response("No pudimos actualizar las cuentas detectadas.", false, 500);
  }
}
