"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePurchasePriceToCents } from "@/modules/purchases/domain/purchase-rules";

type Result = Readonly<{ ok: boolean; message: string }>;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const walletKinds = ["external_contribution", "personal_withdrawal", "broker_to_wallet", "wallet_to_broker"] as const;

async function client() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
function amount(value: string): number | null { try { return parsePurchasePriceToCents(value); } catch { return null; } }

export async function createWalletMovement(input: Readonly<{ amount: string; date: string; fee: string; kind: string; observation: string; periodId: string; walletId: string }>): Promise<Result> {
  const cents = amount(input.amount);
  const fee = input.fee.trim() ? amount(input.fee) : 0;
  if (!uuid(input.periodId) || !uuid(input.walletId) || !input.date || !cents || fee === null || !walletKinds.includes(input.kind as (typeof walletKinds)[number])) return { ok: false, message: "Revisá billetera, fecha, tipo, importe y fee." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("create_nodal_wallet_movement", { target_amount_cents: cents, target_fee_cents: fee, target_kind: input.kind, target_observation: input.observation, target_occurred_on: input.date, target_period_id: input.periodId, target_wallet_id: input.walletId });
  if (error) return { ok: false, message: error.message.includes("insufficient") ? "La billetera no tiene saldo suficiente." : "No se pudo guardar el movimiento de billetera." };
  revalidatePath("/app"); return { ok: true, message: "Movimiento de billetera guardado." };
}

export async function createWalletTransfer(input: Readonly<{ amount: string; date: string; destinationWalletId: string; fee: string; observation: string; periodId: string; sourceWalletId: string }>): Promise<Result> {
  const cents = amount(input.amount);
  const fee = input.fee.trim() ? amount(input.fee) : 0;
  if (!uuid(input.periodId) || !uuid(input.sourceWalletId) || !uuid(input.destinationWalletId)
    || input.sourceWalletId === input.destinationWalletId || !input.date || !cents || fee === null || fee >= cents) {
    return { ok: false, message: "Revisá las billeteras, el importe y el fee." };
  }
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("create_nodal_wallet_transfer", {
    target_amount_cents: cents,
    target_destination_wallet_id: input.destinationWalletId,
    target_fee_cents: fee,
    target_observation: input.observation,
    target_occurred_on: input.date,
    target_period_id: input.periodId,
    target_source_wallet_id: input.sourceWalletId,
  });
  if (error) return { ok: false, message: error.message.includes("insufficient") ? "La billetera de origen no tiene saldo suficiente." : "No se pudo guardar la transferencia entre billeteras." };
  revalidatePath("/app"); return { ok: true, message: "Transferencia entre billeteras guardada." };
}

export async function createWallet(input: Readonly<{ date: string; name: string; openingBalance: string; periodId: string }>): Promise<Result> {
  const opening = input.openingBalance.trim() ? amount(input.openingBalance) : 0;
  if (!uuid(input.periodId) || !input.date || !input.name.trim() || opening === null) return { ok: false, message: "Revisá el nombre y el saldo inicial." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("create_nodal_wallet", { target_name: input.name.trim(), target_opened_on: input.date, target_opening_balance_cents: opening, target_period_id: input.periodId });
  if (error) return { ok: false, message: error.message.includes("duplicate") ? "Ya existe una billetera con ese nombre." : "No se pudo crear la billetera." };
  revalidatePath("/app"); return { ok: true, message: "Billetera creada. El saldo inicial quedó registrado como aporte trader." };
}

export async function renameWallet(input: Readonly<{ name: string; walletId: string }>): Promise<Result> {
  if (!uuid(input.walletId) || !input.name.trim()) return { ok: false, message: "Indicá un nombre válido." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("rename_nodal_wallet", { target_name: input.name.trim(), target_wallet_id: input.walletId });
  if (error) return { ok: false, message: "No se pudo renombrar la billetera." };
  revalidatePath("/app"); return { ok: true, message: "Nombre de billetera actualizado." };
}

export async function createFundingWithdrawal(input: Readonly<{ accountId: string; amount: string; approvedOn: string; periodId: string }>): Promise<Result> {
  const cents = amount(input.amount);
  if (!uuid(input.periodId) || !uuid(input.accountId) || !input.approvedOn || !cents) return { ok: false, message: "Revisá cuenta, fecha e importe del payout." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("create_nodal_funding_withdrawal", { target_account_id: input.accountId, target_amount_cents: cents, target_approved_on: input.approvedOn, target_period_id: input.periodId });
  if (error) return { ok: false, message: "No se pudo guardar el payout aprobado." };
  revalidatePath("/app"); return { ok: true, message: "Payout aprobado y pendiente de cobro." };
}

export async function collectFundingWithdrawal(input: Readonly<{ collectedOn: string; fee: string; periodId: string; walletId: string; withdrawalId: string }>): Promise<Result> {
  const fee = input.fee.trim() ? amount(input.fee) : 0;
  if (!uuid(input.periodId) || !uuid(input.walletId) || !uuid(input.withdrawalId) || !input.collectedOn || fee === null) return { ok: false, message: "Revisá la billetera, la fecha y el fee del cobro." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("collect_nodal_funding_withdrawal_to_wallet", { target_collected_on: input.collectedOn, target_fee_cents: fee, target_period_id: input.periodId, target_wallet_id: input.walletId, target_withdrawal_id: input.withdrawalId });
  if (error) return { ok: false, message: "No se pudo confirmar el cobro." };
  revalidatePath("/app"); return { ok: true, message: "Cobro confirmado e incorporado a la billetera." };
}
