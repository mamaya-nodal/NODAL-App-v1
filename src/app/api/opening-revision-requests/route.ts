import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RequestPayload = Readonly<{ periodId?: unknown }>;

function errorResponse(message: string, status: number) {
  return Response.json(
    { message, ok: false },
    { headers: { "Cache-Control": "no-store" }, status },
  );
}

export async function POST(request: Request) {
  let payload: RequestPayload;
  try {
    payload = await request.json() as RequestPayload;
  } catch {
    return errorResponse("No pudimos identificar el período.", 400);
  }

  const periodId = typeof payload.periodId === "string" ? payload.periodId.trim() : "";
  if (!UUID_PATTERN.test(periodId)) {
    return errorResponse("No pudimos identificar el período.", 400);
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      return errorResponse("La sesión venció. Volvé a ingresar.", 401);
    }

    const { error } = await supabase.rpc("request_nodal_period_opening_revision", {
      target_period_id: periodId,
    });
    if (error?.message.includes("OPENING_REVISION_HAS_ACTIVITY")) {
      return errorResponse(
        "Este período ya tiene actividad. La corrección debe resolverse con trazabilidad contable.",
        409,
      );
    }
    if (error?.message.includes("OPENING_REVISION_NOT_AVAILABLE")) {
      return errorResponse("Este punto de partida no está disponible para edición.", 409);
    }
    if (error) {
      return errorResponse("No pudimos enviar la solicitud. Volvé a intentar.", 500);
    }

    return Response.json(
      {
        message: "Solicitud enviada. Admin Master debe autorizarla antes de editar.",
        ok: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse("No pudimos enviar la solicitud. Volvé a intentar.", 500);
  }
}
