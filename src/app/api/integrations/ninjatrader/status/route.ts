import { createClient } from "@/lib/supabase/server";
import { buildNinjaInventoryRevision } from "@/modules/ninja/domain/inventory-revision";
import { buildNinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ online: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const [statusResult, inventoryResult] = await Promise.all([
    supabase.rpc("get_current_user_ninja_connector_status"),
    supabase.rpc("get_current_user_ninja_inventory"),
  ]);
  const error = statusResult.error ?? inventoryResult.error;
  return Response.json(
    {
      inventoryRevision: error
        ? null
        : buildNinjaInventoryRevision(inventoryResult.data ?? []),
      liveBrokerBalance: error
        ? null
        : buildNinjaLiveBrokerBalance(inventoryResult.data ?? []),
      linked: !error && statusResult.data?.[0]?.status === "active",
      online: !error && Boolean(statusResult.data?.[0]?.is_online),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: error ? 503 : 200 },
  );
}
