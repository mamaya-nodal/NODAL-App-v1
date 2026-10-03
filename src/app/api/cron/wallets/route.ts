import { createServiceClient } from "@/lib/supabase/service";
import { syncWallet } from "@/modules/wallets/server/sync-wallet";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!process.env.ALCHEMY_API_KEY) return Response.json({ status: "not_configured" });
  const db = createServiceClient();
  const { data, error } = await db.from("nodal_wallet_sources").select("wallet_id")
    .not("address", "is", null).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    .order("last_attempted_at", { ascending: true, nullsFirst: true }).limit(10);
  if (error) return Response.json({ error: "No se pudo cargar las billeteras" }, { status: 500 });
  const results = [];
  for (const wallet of data ?? []) results.push(await syncWallet(db, wallet.wallet_id));
  return Response.json({ processed: results.length, failed: results.filter((result) => !result.ok).length });
}
