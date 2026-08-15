"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePurchasePriceToCents } from "@/modules/purchases/domain/purchase-rules";

type Result = Readonly<{ ok: boolean; message: string }>;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const walletKinds = ["external_contribution", "personal_withdrawal", "prior_pending_collection"] as const;

async function client() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
function amount(value: string): number | null { try { return parsePurchasePriceToCents(value); } catch { return null; } }

export async function createWalletMovement(input: Readonly<{ amount: string; date: string; kind: string; observation: string; periodId: string }>): Promise<Result> {
  const cents = amount(input.amount);
  if (!uuid(input.periodId) || !input.date || !cents || !walletKinds.includes(input.kind as (typeof walletKinds)[number])) return { ok: false, message: "Revisá fecha, tipo e importe de billetera." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("create_nodal_wallet_movement", { target_amount_cents: cents, target_kind: input.kind, target_observation: input.observation, target_occurred_on: input.date, target_period_id: input.periodId });
  if (error) return { ok: false, message: "No se pudo guardar el movimiento de billetera." };
  revalidatePath("/app"); return { ok: true, message: "Movimiento de billetera guardado." };
}

export async function createFundingWithdrawal(input: Readonly<{ accountId: string; amount: string; approvedOn: string; periodId: string }>): Promise<Result> {
  const cents = amount(input.amount);
  if (!uuid(input.periodId) || !uuid(input.accountId) || !input.approvedOn || !cents) return { ok: false, message: "Revisá cuenta, fecha e importe del retiro." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("create_nodal_funding_withdrawal", { target_account_id: input.accountId, target_amount_cents: cents, target_approved_on: input.approvedOn, target_period_id: input.periodId });
  if (error) return { ok: false, message: "No se pudo guardar el retiro aprobado." };
  revalidatePath("/app"); return { ok: true, message: "Retiro aprobado guardado como pendiente de cobro." };
}

export async function collectFundingWithdrawal(input: Readonly<{ collectedOn: string; periodId: string; withdrawalId: string }>): Promise<Result> {
  if (!uuid(input.periodId) || !uuid(input.withdrawalId) || !input.collectedOn) return { ok: false, message: "Revisá la fecha de cobro." };
  const { supabase, user } = await client(); if (!user) return { ok: false, message: "La sesión venció." };
  const { error } = await supabase.rpc("collect_nodal_funding_withdrawal", { target_collected_on: input.collectedOn, target_period_id: input.periodId, target_withdrawal_id: input.withdrawalId });
  if (error) return { ok: false, message: "No se pudo confirmar el cobro." };
  revalidatePath("/app"); return { ok: true, message: "Cobro confirmado e incorporado a la billetera." };
}
