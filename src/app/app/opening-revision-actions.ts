"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type OpeningRevisionRequestState = Readonly<{
  message: string;
  ok: boolean;
}>;

export const initialOpeningRevisionRequestState: OpeningRevisionRequestState = {
  message: "",
  ok: false,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestPeriodOpeningRevision(
  _previous: OpeningRevisionRequestState,
  formData: FormData,
): Promise<OpeningRevisionRequestState> {
  const periodId = String(formData.get("period_id") ?? "").trim();
  if (!UUID_PATTERN.test(periodId)) {
    return { message: "No pudimos identificar el período.", ok: false };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: "La sesión venció. Volvé a ingresar.", ok: false };

  const { error } = await supabase.rpc("request_nodal_period_opening_revision", {
    target_period_id: periodId,
  });
  if (error) {
    if (error.message.includes("OPENING_REVISION_HAS_ACTIVITY")) {
      return {
        message: "Este período ya tiene actividad. La corrección debe resolverse con trazabilidad contable.",
        ok: false,
      };
    }
    if (error.message.includes("OPENING_REVISION_NOT_AVAILABLE")) {
      return { message: "Este punto de partida no está disponible para edición.", ok: false };
    }
    return { message: "No pudimos enviar la solicitud. Volvé a intentar.", ok: false };
  }

  revalidatePath("/app");
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/users");
  return {
    message: "Solicitud enviada. Admin Master debe autorizarla antes de editar.",
    ok: true,
  };
}
