import { createClient } from "@/lib/supabase/server";
import { buildNinjaInventoryRevision } from "@/modules/ninja/domain/inventory-revision";
import {
  applyNinjaBrokerAccountAliases,
  buildNinjaLiveBrokerBalance,
  type NinjaBrokerAccountAlias,
} from "@/modules/ninja/domain/live-broker-balance";

export const dynamic = "force-dynamic";

type ConnectorStatusRow = Readonly<{
  identity_id: string | null;
  is_online: boolean;
  status: string;
}>;

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
  const connectorStatuses = (statusResult.data ?? []) as ConnectorStatusRow[];
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
      linked: !error && connectorStatuses.some((connector) => connector.status === "active" && connector.identity_id === null),
      online: !error && connectorStatuses.some((connector) => Boolean(connector.is_online)),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: error ? 503 : 200 },
  );
}
