"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeAddress } from "@/modules/wallets/domain/stablecoins";
import { syncWallet } from "@/modules/wallets/server/sync-wallet";

export async function loadWalletSources(periodId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("La sesión venció.");
  const [{ data: period }, { data: profile }] = await Promise.all([
    db.from("periods").select("workspace_id,lifecycle_status").eq("id", periodId).single(),
    db.from("nodal_users").select("identities_enabled").eq("id", user.id).maybeSingle(),
  ]);
  if (!period) throw new Error("Período no disponible.");
  const [sources, identities, wallets, movements, payouts] = await Promise.all([
    db.from("nodal_wallet_sources").select("wallet_id,identity_id,address,started_at,observed_at,observed_cents,last_error").eq("workspace_id", period.workspace_id),
    profile?.identities_enabled
      ? db.from("nodal_identities").select("id,first_name,last_name").eq("workspace_id", period.workspace_id).order("first_name")
      : Promise.resolve({ data: [], error: null }),
    db.from("nodal_wallets").select("id").eq("workspace_id", period.workspace_id).eq("is_active", true),
    db.from("wallet_movements").select("id,wallet_id,destination_wallet_id,kind,amount_cents,fee_cents,occurred_on").eq("period_id", periodId),
    db.from("funding_withdrawals").select("id,wallet_id,amount_cents,collection_fee_cents,collected_on").eq("collected_period_id", periodId).eq("is_active", true).not("collected_on", "is", null),
  ]);
  if (sources.error || identities.error || wallets.error || movements.error || payouts.error) throw new Error("No se pudo cargar la conexión de billeteras.");
  const observations = wallets.data?.length ? await db.from("nodal_wallet_observations")
    .select("id,wallet_id,chain,tx_hash,symbol,amount_cents,direction,occurred_at,movement_id,payout_id")
    .in("wallet_id", wallets.data.map((wallet) => wallet.id)).order("occurred_at", { ascending: false }).limit(100) : { data: [], error: null };
  if (observations.error) throw new Error("No se pudo cargar el historial detectado.");
  return { configured: Boolean(process.env.ALCHEMY_API_KEY), open: period.lifecycle_status === "open", sources: sources.data ?? [],
    identities: identities.data ?? [], observations: observations.data ?? [], movements: movements.data ?? [], payouts: payouts.data ?? [] };
}

export async function configureWalletSource(walletId: string, identityId: string, address: string) {
  let canonical: string | null = null;
  try { canonical = address.trim() ? normalizeAddress(address) : null; }
  catch { return { ok: false, message: "Ingresá una dirección pública EVM válida (0x…). No una frase de recuperación." }; }
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  if (identityId) {
    const { data: profile } = await db.from("nodal_users").select("identities_enabled").eq("id", user.id).maybeSingle();
    if (!profile?.identities_enabled) return { ok: false, message: "Identidades todavía no fue habilitada por un administrador." };
  }
  const { error } = await db.rpc("configure_nodal_wallet_source", { target_wallet_id: walletId, target_identity_id: identityId || null, target_address: canonical });
  if (error) return { ok: false, message: error.code === "23505" ? "Esa dirección ya está registrada en otra billetera." : "No se pudo guardar. Una dirección conectada no se reemplaza: registrá otra billetera." };
  revalidatePath("/app");
  return { ok: true, message: canonical ? "Dirección vinculada. El saldo detectado no se registrará como aporte ni ganancia." : "Identidad guardada. Movimientos manuales." };
}

export async function assignWalletIdentity(walletId: string, identityId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  if (identityId) {
    const { data: profile } = await db.from("nodal_users").select("identities_enabled").eq("id", user.id).maybeSingle();
    if (!profile?.identities_enabled) return { ok: false, message: "Identidades todavía no fue habilitada por un administrador." };
  }
  const { error } = await db.rpc("assign_nodal_wallet_identity", {
    target_identity_id: identityId || null,
    target_wallet_id: walletId,
  });
  if (error) return { ok: false, message: "No se pudo cambiar la asignación de la billetera." };
  revalidatePath("/app");
  return { ok: true, message: identityId ? "Billetera asignada a la identidad." : "Billetera asignada al titular." };
}

export async function refreshWalletSource(walletId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  const { data: wallet } = await db.from("nodal_wallets").select("workspace_id").eq("id", walletId).eq("is_active", true).single();
  const { data: workspace } = wallet ? await db.from("workspaces").select("id").eq("id", wallet.workspace_id).eq("owner_user_id", user.id).single() : { data: null };
  if (!workspace) return { ok: false, message: "Billetera no disponible." };
  const result = await syncWallet(createServiceClient(), walletId);
  revalidatePath("/app");
  return result;
}

export async function linkWalletObservation(observationId: string, record: string) {
  const [kind, id] = record.split(":");
  if (!id || !["movement", "payout"].includes(kind)) return { ok: false, message: "Seleccioná un registro." };
  const db = await createClient();
  const { error } = await db.rpc("link_nodal_wallet_observation", { target_observation_id: observationId,
    target_movement_id: kind === "movement" ? id : null, target_payout_id: kind === "payout" ? id : null });
  if (error) return { ok: false, message: "No se pudo vincular. Verificá fecha, importe, dirección, período abierto y que el registro no esté vinculado." };
  revalidatePath("/app");
  return { ok: true, message: "Vinculado al registro existente, sin duplicar el movimiento." };
}
