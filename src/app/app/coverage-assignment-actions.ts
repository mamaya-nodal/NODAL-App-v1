"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type AssignmentResult = Readonly<{
  message: string;
  ok: boolean;
  reusedExistingControl?: boolean;
}>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function assignManualAccountsToCoverage(input: Readonly<{
  accountIds: string[];
  batchId: string;
  closeAccounts: boolean;
}>): Promise<AssignmentResult> {
  const accountIds = [...new Set(input.accountIds)];
  if (!isUuid(input.batchId) || accountIds.length < 1 || accountIds.length > 250 || accountIds.some((id) => !isUuid(id))) {
    return { message: "Seleccioná al menos una cuenta válida.", ok: false };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: "La sesión venció. Volvé a ingresar.", ok: false };

  const { data, error } = await supabase.rpc("assign_nodal_manual_accounts_to_ninja_batch", {
    target_account_ids: accountIds,
    target_batch_id: input.batchId,
    target_close_accounts: input.closeAccounts,
  });
  if (error) {
    const detail = error.message.toLowerCase();
    const message = detail.includes("different phases")
      ? "Las cuentas seleccionadas están en etapas distintas. Revisalas antes de asignar."
      : detail.includes("open account owned")
        ? "Sólo podés seleccionar cuentas abiertas de tu espacio."
      : detail.includes("same company and period")
        ? "Todas las cuentas deben pertenecer a la misma empresa y período."
        : detail.includes("older coverage")
          ? "Esta cobertura es anterior al último registro. Necesita una corrección histórica controlada."
          : detail.includes("more than one existing control")
            ? "Hay más de un registro que podría corresponder a esta cobertura. No se modificó nada."
            : "No se pudo asignar la cobertura. No se modificó ningún registro.";
    return { message, ok: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const reusedExistingControl = Boolean(row?.reused_existing_control);
  revalidatePath("/app");
  return {
    message: reusedExistingControl
      ? "Cobertura vinculada al registro existente, sin duplicar resultados."
      : `Cobertura distribuida entre ${accountIds.length} ${accountIds.length === 1 ? "cuenta" : "cuentas"} y conciliada.`,
    ok: true,
    reusedExistingControl,
  };
}
