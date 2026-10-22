"use server";

import { revalidatePath } from "next/cache";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SaveDistributionInput = Readonly<{
  adminPoolBps: number;
  adminShares: readonly Readonly<{ adminUserId: string; shareBps: number }>[];
  effectiveMonth: string;
  nodalBps: number;
  reason: string;
  userBps: number;
  userId: string;
}>;

export async function saveMasterDistribution(input: SaveDistributionInput) {
  const numbers = [input.userBps, input.nodalBps, input.adminPoolBps];
  const uniqueAdmins = new Set(input.adminShares.map((share) => share.adminUserId));
  const sharesTotal = input.adminShares.reduce((sum, share) => sum + share.shareBps, 0);
  if (!UUID_PATTERN.test(input.userId)
    || !/^\d{4}-\d{2}-01$/.test(input.effectiveMonth)
    || numbers.some((value) => !Number.isInteger(value) || value < 0 || value > 10_000)
    || numbers.reduce((sum, value) => sum + value, 0) !== 10_000
    || input.adminShares.length !== uniqueAdmins.size
    || input.adminShares.some((share) => !UUID_PATTERN.test(share.adminUserId)
      || !Number.isInteger(share.shareBps) || share.shareBps <= 0 || share.shareBps > 10_000)
    || sharesTotal !== input.adminPoolBps
    || input.reason.trim().length < 3) {
    return { ok: false, message: "Revisá la distribución: ambos totales deben cerrar exactamente en 100%." };
  }
  const db = await requireNodalAdmin();
  const { error } = await db.rpc("admin_save_user_distribution", {
    management_reason: input.reason.trim(),
    target_admin_pool_bps: input.adminPoolBps,
    target_admin_shares: input.adminShares,
    target_effective_month: input.effectiveMonth,
    target_nodal_bps: input.nodalBps,
    target_user_bps: input.userBps,
    target_user_id: input.userId,
  });
  if (error) {
    const message = error.message.includes("ADMIN_POOL_MISMATCH")
      ? "El desglose administrativo no coincide con la bolsa."
      : error.message.includes("INVALID_ADMIN_SHARE")
        ? "Solo podés incluir administradores vigentes de la cadena de este usuario."
        : error.message.includes("CURRENT_PERIOD_ONLY")
          ? "Los períodos cerrados no pueden modificarse."
          : "No se pudo guardar el acuerdo. El cambio no fue aplicado.";
    return { ok: false, message };
  }
  revalidatePath("/app/admin");
  revalidatePath("/app/mi-mesa");
  revalidatePath("/app");
  return { ok: true, message: "Distribución guardada con trazabilidad." };
}
