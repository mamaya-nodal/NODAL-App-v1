"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readOpeningBrokerState } from "@/modules/ninja/server/opening-broker-state";

export async function getOpeningBrokerState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "La sesión venció." };
  try { return { ok: true as const, ...await readOpeningBrokerState(supabase, user.id) }; }
  catch { return { ok: false as const, message: "No se pudo comprobar el saldo broker. Volvé a intentar." }; }
}

export async function claimOpeningBrokerAccount(input: { accountName: string; connectionName: string; physicalConnectorId: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "La sesión venció." };
  if (!/^[0-9a-f-]{36}$/i.test(input.physicalConnectorId) || !input.accountName.trim() || !input.connectionName.trim()) {
    return { ok: false as const, message: "La cuenta no es válida." };
  }
  try {
    const state = await readOpeningBrokerState(supabase, user.id);
    if (!state.pendingAccounts.some((account) => account.physicalConnectorId === input.physicalConnectorId
      && account.accountName === input.accountName && account.connectionName === input.connectionName)) {
      return { ok: false as const, message: "Esta cuenta no está disponible para tu apertura." };
    }
  } catch { return { ok: false as const, message: "No se pudo comprobar la cuenta. Volvé a intentar." }; }
  // Existing audited RPC checks the proposed destination, active user and ownership.
  const { error } = await supabase.rpc("claim_ninja_broker_account", {
    target_account_name: input.accountName, target_connection_name: input.connectionName,
    target_physical_connector_id: input.physicalConnectorId,
  });
  if (error) return { ok: false as const, message: "No se pudo confirmar la titularidad de esta cuenta." };
  revalidatePath("/app");
  return getOpeningBrokerState();
}

export async function discardOpeningBrokerAccount(input: { accountName: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "La sesión venció." };
  const accountName = input.accountName.trim();
  if (!accountName) return { ok: false as const, message: "La cuenta no es válida." };
  try {
    const state = await readOpeningBrokerState(supabase, user.id);
    const isPending = state.pendingAccounts.some((account) =>
      account.accountName.trim().toUpperCase() === accountName.toUpperCase());
    const isIncluded = state.liveBrokerBalance?.sourceAccounts.some((account) =>
      account.accountName.trim().toUpperCase() === accountName.toUpperCase()) ?? false;
    if (!isPending && !isIncluded) {
      return { ok: false as const, message: "Esta cuenta ya no está disponible para descartar." };
    }
  } catch { return { ok: false as const, message: "No se pudo comprobar la cuenta. Volvé a intentar." }; }
  const { error } = await supabase.rpc("discard_ninja_broker_account", {
    target_account_name: accountName,
  });
  if (error) return { ok: false as const, message: "No se pudo descartar la cuenta broker." };
  revalidatePath("/app");
  return getOpeningBrokerState();
}
