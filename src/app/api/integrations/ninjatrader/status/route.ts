import { createClient } from "@/lib/supabase/server";
import { buildIdentityReviewRevision } from "@/modules/identities/domain/identity-review-revision";
import { buildNinjaInventoryRevision } from "@/modules/ninja/domain/inventory-revision";
import {
  applyNinjaBrokerAccountAliases,
  buildNinjaLiveBrokerBalance,
  type NinjaBrokerAccountAlias,
} from "@/modules/ninja/domain/live-broker-balance";
import { principalConnectorSignal } from "@/modules/ninja/domain/connector-status";

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

  const [statusResult, inventoryResult, aliasesResult, identityRequestsResult] = await Promise.all([
    supabase.rpc("get_current_user_ninja_connector_status"),
    supabase.rpc("get_current_user_ninja_inventory"),
    supabase
      .from("ninja_broker_account_aliases")
      .select("connection_name,account_name,display_name"),
    supabase
      .from("identity_onboarding_requests")
      .select("id,status")
      .eq("status", "submitted"),
  ]);
  const error = statusResult.error ?? inventoryResult.error;
  const aliases = (aliasesResult.data ?? []).map((alias): NinjaBrokerAccountAlias => ({
    accountName: alias.account_name,
    connectionName: alias.connection_name,
    displayName: alias.display_name,
  }));
  const connectorStatuses = (statusResult.data ?? []) as ConnectorStatusRow[];
  const principalSignal = principalConnectorSignal(connectorStatuses.map((connector) => ({
    identityId: connector.identity_id,
    isOnline: connector.is_online,
    status: connector.status,
  })));
  return Response.json(
    {
      identityReviewRevision: identityRequestsResult.error
        ? null
        : buildIdentityReviewRevision(identityRequestsResult.data ?? []),
      inventoryRevision: error
        ? null
        : buildNinjaInventoryRevision(inventoryResult.data ?? []),
      liveBrokerBalance: error
        ? null
        : applyNinjaBrokerAccountAliases(
            buildNinjaLiveBrokerBalance(inventoryResult.data ?? []),
            aliases,
          ),
      linked: !error && principalSignal.linked,
      online: !error && principalSignal.online,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: error ? 503 : 200 },
  );
}
