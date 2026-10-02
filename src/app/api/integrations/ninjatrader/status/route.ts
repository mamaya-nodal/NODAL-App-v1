import { createClient } from "@/lib/supabase/server";
import { readWithRetry, reportReadFailure } from "@/lib/supabase/read-with-retry";
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
  const { data: { user }, error: authError } = await readWithRetry(() => supabase.auth.getUser());
  if (authError && authError.name !== "AuthSessionMissingError") {
    reportReadFailure("status-authentication", authError);
    return Response.json({ error: "No pudimos verificar la sesión" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!user) {
    return Response.json({ online: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const [statusResult, inventoryResult, aliasesResult] = await Promise.all([
    readWithRetry(() => supabase.rpc("get_current_user_ninja_connector_status_v2")),
    readWithRetry(() => supabase.rpc("get_current_user_ninja_inventory")),
    supabase
      .from("ninja_broker_account_aliases")
      .select("connection_name,account_name,display_name"),
  ]);
  const error = statusResult.error ?? inventoryResult.error ?? aliasesResult.error;
  if (error) {
    reportReadFailure("connector-status", error);
    return Response.json({ error: "No pudimos consultar la conexión" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
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
