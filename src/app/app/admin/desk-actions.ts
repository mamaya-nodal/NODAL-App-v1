"use server";
import { revalidatePath } from "next/cache";
import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
export type ManagementResult = { ok: boolean; message: string };
const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const bps = (form: FormData, key: string) =>
  Math.round(Number(value(form, key).replace(",", ".")) * 100);
const errors: Record<string, string> = {
  LEVEL_TWO_REQUIRED: "El administrador debe tener nivel 2 o 3.",
  ALREADY_MANAGES_DESK: "Esta persona ya administra una mesa.",
  DESK_HAS_MEMBERS:
    "Trasladá los usuarios y revisá las mesas dependientes antes de desactivar.",
  INVALID_EFFECTIVE_MONTH: "Los cambios corresponden al período actual.",
  USER_NOT_ACTIVE: "El usuario debe tener acceso activo.",
  DESK_NOT_ACTIVE: "La mesa de destino no está activa.",
};
export async function saveUserTerms(
  _previous: ManagementResult,
  form: FormData,
): Promise<ManagementResult> {
  const db = await requireNodalAdmin();
  if (
    !value(form, "commission") ||
    !Number.isFinite(bps(form, "commission")) ||
    bps(form, "commission") < 0 ||
    bps(form, "commission") > 10000
  )
    return { ok: false, message: "Ingresá una comisión entre 0 y 100%." };
  const { error } = await db.rpc("admin_save_user_terms", {
    p_user: value(form, "user"),
    p_month: value(form, "month"),
    p_desk: value(form, "desk"),
    p_level: Number(value(form, "level")),
    p_state: value(form, "state"),
    p_commission: bps(form, "commission"),
    p_bonus: false,
  });
  if (error)
    return {
      ok: false,
      message:
        errors[error.message] ??
        "No se pudo guardar. Revisá los datos e intentá nuevamente.",
    };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Cambios guardados en el historial." };
}
export async function saveDesk(
  _previous: ManagementResult,
  form: FormData,
): Promise<ManagementResult> {
  const db = await requireNodalAdmin();
  if (
    !value(form, "commission") ||
    !Number.isFinite(bps(form, "commission")) ||
    bps(form, "commission") < 0 ||
    bps(form, "commission") > 10000
  )
    return { ok: false, message: "Ingresá una comisión entre 0 y 100%." };
  const { error } = await db.rpc("admin_save_desk", {
    p_id: value(form, "id") || null,
    p_name: value(form, "name"),
    p_parent: value(form, "parent"),
    p_manager: value(form, "manager"),
    p_month: value(form, "month"),
    p_nodal: bps(form, "commission"),
    p_active: form.get("active") === "on",
  });
  if (error)
    return {
      ok: false,
      message: errors[error.message] ?? "No se pudo guardar la mesa.",
    };
  revalidatePath("/app", "layout");
  return {
    ok: true,
    message:
      "Mesa guardada. La actividad del administrador conserva su mesa de origen.",
  };
}
