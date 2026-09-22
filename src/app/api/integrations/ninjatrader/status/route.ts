import { createClient } from "@/lib/supabase/server";
import { buildNinjaInventoryRevision } from "@/modules/ninja/domain/inventory-revision";
import {
  applyNinjaBrokerAccountAliases,
  buildNinjaLiveBrokerBalance,
  type NinjaBrokerAccountAlias,
} from "@/modules/ninja/domain/live-broker-balance";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ online: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const [statusResult, inventoryResult, aliasesResult] = await Promise.all([
    supabase.rpc("get_current_user_ninja_connector_status"),
    supabase.rpc("get_current_user_ninja_inventory"),
    supabase
      .from("ninja_broker_account_aliases")
      .select("connection_name,account_name,display_name"),
  ]);
  const error = statusResult.error ?? inventoryResult.error;
  const aliases = (aliasesResult.data ?? []).map((alias): NinjaBrokerAccountAlias => ({
    accountName: alias.account_name,
    connectionName: alias.connection_name,
    displayName: alias.display_name,
  }));
  return Response.json(
    {
      inventoryRevision: error
        ? null
        : buildNinjaInventoryRevision(inventoryResult.data ?? []),
      liveBrokerBalance: error
        ? null
        : applyNinjaBrokerAccountAliases(
            buildNinjaLiveBrokerBalance(inventoryResult.data ?? []),
            aliases,
          ),
      linked: !error && statusResult.data?.[0]?.status === "active",
      online: !error && Boolean(statusResult.data?.[0]?.is_online),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: error ? 503 : 200 },
  );
}
