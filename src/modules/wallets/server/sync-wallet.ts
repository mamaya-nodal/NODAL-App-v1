import type { SupabaseClient } from "@supabase/supabase-js";
import { readStablecoinWallet } from "./alchemy";

export async function syncWallet(db: SupabaseClient, walletId: string) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return { ok: false, message: "Lectura pendiente de configurar: falta la clave del proveedor en el servidor." };
  const { data: token, error: claimError } = await db.rpc("claim_nodal_wallet_sync", { target_wallet_id: walletId });
  if (claimError || !token) return { ok: false, message: "Ya se está actualizando o se actualizó recientemente. Esperá unos minutos." };
  try {
    const { data: source, error } = await db.from("nodal_wallet_sources").select("address,started_at,synced_through").eq("wallet_id", walletId).single();
    if (error || !source?.address) throw new Error("Wallet unavailable");
    // Overlap for delayed indexing; observations deduplicate by chain + transaction + log.
    const start = new Date(Math.max(Date.parse(source.started_at), Date.parse(source.synced_through ?? source.started_at) - 86_400_000)).toISOString();
    const through = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = await readStablecoinWallet(source.address, start, through, key);
    const { error: saveError } = await db.rpc("complete_nodal_wallet_sync", {
      target_wallet_id: walletId, target_token: token, target_through: through,
      target_balance: result.balance_cents, target_breakdown: result.breakdown, target_transfers: result.transfers,
    });
    if (saveError) throw saveError;
    return { ok: true, message: "Lectura actualizada. Los movimientos detectados no modifican la contabilidad." };
  } catch {
    await db.from("nodal_wallet_sources").update({ last_error: "Consulta incompleta. Se conserva la última lectura válida.", last_attempted_at: new Date().toISOString(), lease_token: null,
      lease_until: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("wallet_id", walletId).eq("lease_token", token);
    return { ok: false, message: "No se pudo completar la lectura. No se modificaron saldos ni movimientos contables." };
  }
}
