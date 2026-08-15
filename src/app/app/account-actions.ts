"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  parsePurchasePriceToCents,
} from "@/modules/purchases/domain/purchase-rules";

export type AccountStateMode = "automatic" | "manual_live" | "manual_closed";

type ActionResult =
  | Readonly<{ ok: true; message: string }>
  | Readonly<{ ok: false; message: string }>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isStateMode(value: string): value is AccountStateMode {
  return value === "automatic" || value === "manual_live" || value === "manual_closed";
}

async function authenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function setAccountStateMode(input: Readonly<{
  accountId: string;
  mode: string;
  periodId: string;
}>): Promise<ActionResult> {
  if (!isUuid(input.accountId) || !isUuid(input.periodId) || !isStateMode(input.mode)) {
    return { ok: false, message: "El estado o la cuenta no son válidos." };
  }

  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const { error } = await supabase.rpc("set_nodal_account_state_mode", {
    target_account_id: input.accountId,
    target_period_id: input.periodId,
    target_state_origin: input.mode,
  });

  if (error) {
    return { ok: false, message: "No se pudo actualizar el estado de la cuenta." };
  }

  revalidatePath("/app");
  return {
    ok: true,
    message:
      input.mode === "automatic"
        ? "Estado automático restaurado."
        : input.mode === "manual_live"
          ? "La cuenta quedó forzada como Cuenta viva."
          : "La cuenta quedó forzada como Cuenta cerrada.",
  };
}

export async function saveAccountPhaseWithdrawal(input: Readonly<{
  accountId: string;
  amount: string;
  periodId: string;
  phase: string;
}>): Promise<ActionResult> {
  const validPhases = [
    "Primera vuelta",
    "Segunda vuelta",
    "Tercera vuelta",
    "Cuarta vuelta",
    "Quinta vuelta",
  ] as const;

  if (
    !isUuid(input.accountId) ||
    !isUuid(input.periodId) ||
    !validPhases.includes(input.phase as (typeof validPhases)[number])
  ) {
    return { ok: false, message: "La vuelta o la cuenta no son válidas." };
  }

  let amountInCents: number;
  try {
    amountInCents = parsePurchasePriceToCents(input.amount);
  } catch {
    return { ok: false, message: "TOTAL RETIRO debe ser un importe válido con hasta dos decimales." };
  }

  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const { error } = await supabase.rpc("set_nodal_account_phase_withdrawal", {
    target_account_id: input.accountId,
    target_period_id: input.periodId,
    target_phase: input.phase,
    target_total_withdrawal_cents: amountInCents,
  });

  if (error) {
    return { ok: false, message: "No se pudo guardar TOTAL RETIRO." };
  }

  revalidatePath("/app");
  return { ok: true, message: "TOTAL RETIRO guardado y cuenta recalculada." };
}
