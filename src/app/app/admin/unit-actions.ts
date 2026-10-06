"use server";

import { revalidatePath } from "next/cache";

import { accountingPeriodMonthAt } from "@/modules/accounting/domain/period-calendar";
import { requireNodalAdmin } from "@/modules/admin/server/admin-access";

export type SaveUnitInput = Readonly<{
  code: string;
  companyName: string;
  email: string;
  id: string | null;
  nodalPercent: string;
  responsible: string;
}>;

export type SaveUnitResult = Readonly<{ message: string; ok: boolean }>;

export async function saveNodalUnit(input: SaveUnitInput): Promise<SaveUnitResult> {
  const companyName = String(input.companyName ?? "").trim().replace(/^Unidad\s+/i, "");
  const code = String(input.code ?? "").trim().toUpperCase();
  const responsible = String(input.responsible ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const percentage = Number(String(input.nodalPercent ?? "").replace(",", "."));
  if (!companyName || !responsible || !email || !Number.isFinite(percentage)) {
    return { message: "Completá todos los datos de la unidad.", ok: false };
  }
  if (!/^[A-Z]{2}$/.test(code)) return { message: "La abreviación debe tener exactamente dos letras.", ok: false };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { message: "Ingresá un e-mail válido para la persona responsable.", ok: false };
  if (percentage < 0 || percentage > 100) return { message: "El acuerdo NODAL debe estar entre 0% y 100%.", ok: false };

  const db = await requireNodalAdmin();
  const { error } = await db.rpc("admin_save_nodal_unit", {
    target_agreement_bps: Math.round(percentage * 100),
    target_code: code,
    target_company_name: companyName,
    target_effective_month: accountingPeriodMonthAt(),
    target_reason: input.id ? "Actualización de unidad desde Admin Master" : "Alta de unidad desde Admin Master",
    target_responsible_email: email,
    target_responsible_name: responsible,
    target_unit_id: input.id,
  });
  if (error?.message.includes("UNIT_CODE_EXISTS")) return { message: "Esa abreviación ya pertenece a otra unidad.", ok: false };
  if (error) return { message: "No se pudo guardar la unidad. El cambio no fue aplicado.", ok: false };

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/periods");
  revalidatePath("/app/admin/statistics");
  return { message: input.id ? "Unidad actualizada y auditada." : "Unidad creada con su Mesa Principal.", ok: true };
}
