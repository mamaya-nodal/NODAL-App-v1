"use server";

import { revalidatePath } from "next/cache";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";

export type MasterUserRole = "admin" | "admin_master" | "user";

export type SaveMasterUserRoleInput = Readonly<{
  adminBps: number | null;
  role: MasterUserRole;
  userId: string;
}>;

export type SaveMasterUserRoleResult = Readonly<{
  message: string;
  ok: boolean;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveMasterUserRole(
  input: SaveMasterUserRoleInput,
): Promise<SaveMasterUserRoleResult> {
  const userId = String(input.userId ?? "").trim();
  const role = String(input.role ?? "") as MasterUserRole;
  const adminBps = input.adminBps;

  if (!UUID_PATTERN.test(userId) || !["user", "admin", "admin_master"].includes(role)) {
    return { message: "Los datos del rol no son válidos.", ok: false };
  }
  if (role !== "user" && (!Number.isInteger(adminBps) || adminBps! < 0 || adminBps! > 10_000)) {
    return { message: "El porcentaje de mesa debe estar entre 0% y 100%.", ok: false };
  }

  const db = await requireNodalAdmin();
  const { error } = await db.rpc("admin_update_nodal_user_role", {
    target_admin_bps: role === "user" ? null : adminBps,
    target_role: role,
    target_user_id: userId,
  });

  if (error) {
    if (error.message.includes("ADMIN_HAS_DEPENDENCIES")) {
      return { message: "Antes de quitar el rol Admin, reasigná los usuarios y las mesas que dependen de esa persona.", ok: false };
    }
    if (error.message.includes("SELF_MASTER_REMOVAL_FORBIDDEN")) {
      return { message: "Por seguridad no podés quitarte tu propio acceso de Admin Master.", ok: false };
    }
    if (error.message.includes("LAST_MASTER_REQUIRED")) {
      return { message: "Debe permanecer al menos un Admin Master activo en el sistema.", ok: false };
    }
    if (error.message.includes("USER_NOT_ACTIVE") || error.message.includes("USER_TERMS_NOT_FOUND")) {
      return { message: "El usuario todavía no está activo o no tiene una asignación vigente.", ok: false };
    }
    return { message: "No se pudo guardar el rol. El cambio no fue aplicado.", ok: false };
  }

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/users");
  revalidatePath("/app/mi-mesa");
  return { message: "Rol y porcentaje de mesa actualizados con trazabilidad.", ok: true };
}
