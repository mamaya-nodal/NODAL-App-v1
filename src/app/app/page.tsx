import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { resolveWithDeadline } from "@/lib/async/resolve-with-deadline";
import { currentAppRelease } from "@/lib/app-release";
import { createClient } from "@/lib/supabase/server";
import { readWithRetry, reportReadFailure } from "@/lib/supabase/read-with-retry";
import { ConnectionRecovery } from "./connection-recovery";
import { buildManualAccountEconomicHistory } from "@/modules/operations/domain/manual-account-economic-history";
import { buildDetectedAccountEconomicHistory } from "@/modules/operations/domain/detected-account-economic-history";
import {
  buildIdentitySummaries,
  type IdentityAccount,
  type IdentityConnectorInstallation,
  type IdentitySummary,
  type ManagedIdentity,
} from "@/modules/identities/domain/identity-summary";
import { decideAccess } from "@/modules/access/domain/access-decision";
import { loadMyAdministrationScope } from "@/modules/admin/server/administration-scope";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import { classifyNinjaAccount } from "@/modules/ninja/domain/account-classification";
import { registeredNinjaAccountKeys as resolveRegisteredNinjaAccountKeys } from "@/modules/ninja/domain/account-registration-eligibility";
import { ninjaAccountRegistrationKey } from "@/modules/ninja/domain/account-registration-key";
import type { NinjaAccountSnapshot } from "@/modules/ninja/domain/ingestion-payload";
import {
  applyNinjaBrokerAccountAliases,
  buildNinjaLiveBrokerBalance,
  type NinjaBrokerAccountAlias,
  type NinjaLiveBrokerBalance,
} from "@/modules/ninja/domain/live-broker-balance";
import { buildNinjaInventoryRevision } from "@/modules/ninja/domain/inventory-revision";
import type {
  AccountPhaseWithdrawal,
} from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { isPayoutEligibleAccount } from "@/modules/operations/domain/account-progress";
import {
  buildOperationalSummary,
  type OperationalSummary,
  type FundingWithdrawal,
  type WalletMovement,
} from "@/modules/summary/domain/operational-summary";
import {
  buildCapitalHistory,
  buildHomeDailyHistory,
  buildHomePerformance,
  type CapitalHistoryPoint,
  type HomePerformance,
} from "@/modules/summary/domain/home-dashboard";
import { canConfigurePeriodOpening } from "@/modules/summary/domain/opening-eligibility";
import type { OperationalOpeningSnapshot } from "@/modules/summary/domain/operational-summary";
import {
  type OpeningAccountStage,
  type PeriodOpeningRecord,
} from "@/modules/summary/domain/opening-snapshot";
import {
  buildPeriodEarnings,
  type PersonalDashboardData,
} from "@/modules/summary/domain/personal-dashboard";
import { loadPersonalDeskDashboard } from "@/modules/summary/server/personal-desk-dashboard";
import {
  formatPeriodLabel,
  resolveWorkspaceSelection,
  type WorkspaceOption,
} from "@/modules/workspace/domain/selection";

import { createPurchase } from "./purchase-actions";
import { AccessPendingGate } from "./access-pending-gate";
import { DevelopmentPeriodReset } from "./development-period-reset";
import { DetectedNinjaAccounts } from "./detected-ninja-accounts";
import { NinjaConnectorGate } from "./ninja-connector-gate";
import { NinjaConnectorMonitor } from "./ninja-connector-monitor";
import { NinjaTransitionAlerts, type NinjaTransitionAlert } from "./ninja-transition-alerts";
import { NinjaConnectorPanel, type NinjaConnectorStatus } from "./ninja-connector-panel";
import {
  DailyControlPreview,
  type NinjaBrokerBalanceEvent,
  type NinjaBrokerBalanceHistoryItem,
  type PersistedDailyControl,
} from "./daily-control-preview";
import { HomeOverview } from "./home-overview";
import type { RegisterAccount } from "./operation-register";
import { ProgressSummary, type WalletIdentityView, type WalletView } from "./progress-summary";
import { ThemeToggle } from "./theme-toggle";
import { AppWorkspace } from "./app-workspace";
import { AccountsOverview, type AccountOverviewAccount, type AccountOverviewPayout } from "./accounts-overview";
import { PurchasePaymentFields } from "./purchase-payment-fields";
import { OpeningAccountReferences, OpeningOperationReference } from "./opening-snapshot-panels";
import type { AccountingPeriodView, EconomicTraceItem } from "./progress-summary";
import { IdentitiesWorkspace } from "./identities-workspace";

type PrivateAppPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    period?: string | string[];
    purchase_result?: string | string[];
    reset_result?: string | string[];
    connector_result?: string | string[];
    transition_result?: string | string[];
  }>;
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

const purchaseMessages: Record<string, string> = {
  already_created: "Esa cuenta de Ninja ya estaba vinculada. No se creó una compra duplicada.",
  created: "Compra confirmada. La cuenta quedó creada como Cuenta virgen.",
  invalid_data: "Revisá la empresa, el precio y el origen de fondos.",
  not_created: "La compra no pudo confirmarse. No se guardó ningún dato.",
  period_not_current:
    "Ese período no admite una compra con fecha automática. La carga histórica sigue pendiente de definición.",
  wallet_insufficient: "La billetera elegida no tiene saldo suficiente para pagar esta cuenta. No se guardó ningún dato.",
  wallet_not_available: "La billetera elegida ya no está disponible. Elegí otra billetera.",
  wallet_required: "Elegí la billetera desde la que querés pagar la cuenta.",
};

const resetMessages: Record<string, string> = {
  confirmation_required: "Para reiniciar los datos escribí REINICIAR exactamente como se indica.",
  invalid: "No se pudo identificar el período que querías reiniciar.",
  not_reset: "No se pudieron reiniciar los datos. No se borró ningún registro.",
  unavailable: "El reinicio de pruebas solo está disponible en la aplicación local.",
};

const connectorMessages: Record<string, string> = {
  revoked: "El conector fue desvinculado. Dejó de tener autorización para enviar datos.",
  not_revoked: "No se pudo desvincular el conector.",
};

type PurchaseView = {
  companyCode: string;
  externalName: string | null;
  fundsOrigin: string;
  id: string;
  priceCents: number;
  purchaseNumber: number;
  purchasedOn: string;
  referenceNumber: number;
  state: string;
};

type AccountView = RegisterAccount;

type NinjaInventoryRpcRow = {
  accounts: Array<NinjaAccountSnapshot & { firstSeenAt?: string }>;
  connector_id: string;
  observed_at: string;
};

type NinjaConnectorStatusRpcRow = {
  connector_id: string;
  connector_version: string;
  identity_first_name: string | null;
  identity_id: string | null;
  identity_last_name: string | null;
  is_online: boolean;
  installed_source_version: string | null;
  last_seen_at: string | null;
  paired_at: string;
  status: string;
};

type NinjaTransitionRpcRow = {
  automatic: boolean;
  connection_name: string;
  event_type: string;
  from_account_name: string | null;
  id: string;
  occurred_at: string;
  reason: string;
  resolution_status: string;
  to_account_name: string | null;
};

type NinjaBrokerBalanceRpcRow = {
  balance_cents: number | string;
  id: string;
  observed_at: string;
  source_accounts: NinjaBrokerBalanceEvent["sourceAccounts"];
  source_event_id: string;
};

type NinjaOperationProbeRpcRow = {
  account_name: string;
  closing_balance: number | string | null;
  connection_name: string;
  minimum_net_liquidation: number | string | null;
  minimum_net_liquidation_at: string | null;
  status: "closed" | "open" | "settling";
};

type NinjaReconciliationRpcRow = {
  accounting_status: string;
};

async function renderPrivateAppPage({
  searchParams,
}: PrivateAppPageProps) {
  const appRelease = currentAppRelease();
  const supabase = await createClient();
  const {
    data: claimsData,
    error: authenticationError,
  } = await readWithRetry(() => supabase.auth.getClaims());

  if (authenticationError && authenticationError.name !== "AuthSessionMissingError") {
    reportReadFailure("authentication", authenticationError);
    return <ConnectionRecovery subject="access" />;
  }

  const userId = claimsData?.claims.sub;
  const userEmail = typeof claimsData?.claims.email === "string"
    ? claimsData.claims.email
    : null;

  if (!userId) {
    redirect("/");
  }

  const { data: nodalUser, error: accessError } = await readWithRetry(() => supabase
    .from("nodal_users")
    .select("id, email, display_name, access_state, access_role")
    .eq("id", userId)
    .maybeSingle());

  if (accessError) {
    reportReadFailure("authorization", accessError);
    return <ConnectionRecovery subject="access" />;
  }

  const decision = decideAccess(
    userId,
    nodalUser
      ? { id: nodalUser.id, accessState: nodalUser.access_state }
      : null,
  );
  const allowed = decision === "allowed";

  if (!allowed) {
    return <AccessPendingGate email={nodalUser?.email || userEmail || "Cuenta de Google"} />;
  }

  const administrationScopePromise = allowed
    ? loadMyAdministrationScope(userId, supabase)
    : Promise.resolve({ kind: "none" as const });
  const searchParamsPromise = searchParams;
  let workspaceOptions: WorkspaceOption[] = [];
  let companies: Array<{ code: string; displayName: string; id: string }> = [];
  let registeredNinjaAccountKeys = new Set<string>();
  let excludedNinjaAccountKeys = new Set<string>();
  let ninjaNamesByAccountId = new Map<string, string>();
  let ninjaConnectionNamesByAccountId = new Map<string, string>();
  let ninjaOperationalStatesByAccountId = new Map<string, "Evaluation" | "Funded" | "Live">();
  let ninjaInventories: NinjaInventoryRpcRow[] = [];
  let connectedNinjaBrokerAccountNames: string[] = [];
  let connectedNinjaPropAccountNames: string[] = [];
  let ninjaConnector: NinjaConnectorStatus | null = null;
  let ninjaConnectors: NinjaConnectorStatus[] = [];
  let ninjaTransitionAlerts: NinjaTransitionAlert[] = [];
  let incomingNinjaBalance: NinjaBrokerBalanceEvent | null = null;
  let ninjaBrokerBalanceHistory: NinjaBrokerBalanceHistoryItem[] = [];
  let liveNinjaBrokerBalance: NinjaLiveBrokerBalance | null = null;
  let ninjaBrokerSourceNotice: string | null = null;
  let ninjaInventoryRevision = buildNinjaInventoryRevision([]);
  let ninjaAccountBalances = new Map<string, {
    currentInCents: number | null;
    initialInCents: number | null;
    minimumNetLiquidationInCents: number | null;
    technicalTradeCount: number;
  }>();
  let hasPendingNinjaOperation = false;

  if (allowed) {
    const [{ data: workspaces, error: workspaceError }, { data: ninjaConnectorRows, error: connectorError }] = await Promise.all([
      readWithRetry(() => supabase
        .from("workspaces")
        .select("id, modality, periods(id, period_month, lifecycle_status, operational_start_on, scheduled_close_at)")
        .order("modality")),
      readWithRetry(() => supabase.rpc("get_current_user_ninja_connector_status_v2")),
    ]);

    if (workspaceError || connectorError) {
      reportReadFailure(workspaceError ? "workspaces" : "connector", (workspaceError ?? connectorError)!);
      return <ConnectionRecovery subject="connector" />;
    }

    workspaceOptions = (workspaces ?? []).map((workspace) => ({
      id: workspace.id,
      modality: workspace.modality,
      periods: workspace.periods.map((workspacePeriod) => ({
        id: workspacePeriod.id,
        lifecycleStatus: workspacePeriod.lifecycle_status,
        operationalStartOn: workspacePeriod.operational_start_on,
        periodMonth: workspacePeriod.period_month,
        scheduledCloseAt: workspacePeriod.scheduled_close_at,
      })),
    }));

    ninjaConnectors = ((ninjaConnectorRows ?? []) as NinjaConnectorStatusRpcRow[]).map((connectorRow) => ({
      connectorId: connectorRow.connector_id,
      connectorVersion: connectorRow.connector_version,
      installedSourceVersion: connectorRow.installed_source_version,
      identityId: connectorRow.identity_id,
      isOnline: connectorRow.is_online,
      lastSeenAt: connectorRow.last_seen_at,
      pairedAt: connectorRow.paired_at,
      status: connectorRow.status,
    }));
    ninjaConnector = ninjaConnectors.find((connector) => connector.identityId === null) ?? null;
  }

  const connectorOnline = Boolean(ninjaConnector?.isOnline && ninjaConnector.status === "active");
  const administrationScope = await administrationScopePromise;
  const { purchase_result: purchaseResult, reset_result: resetResult, connector_result: connectorResult, transition_result: transitionResult } = await searchParamsPromise;

  if (allowed && (!ninjaConnector || ninjaConnector.status !== "active")) {
    return (
      <NinjaConnectorGate
        administrationScope={administrationScope}
        connector={ninjaConnector}
        message={singleValue(connectorResult) === "revoked" ? connectorMessages.revoked : undefined}
      />
    );
  }

  const selection = resolveWorkspaceSelection(
    workspaceOptions,
    "real",
    undefined,
  );
  const currentPeriod = selection?.period;
  const personalDashboardPromise = currentPeriod
    ? loadPersonalDeskDashboard(currentPeriod.periodMonth, userId)
    : Promise.resolve(null);
  const accountingPeriodSummariesPromise = currentPeriod && selection
    ? loadPeriodSummaries(
        supabase,
        selection.workspace.periods
          .filter((workspacePeriod) => workspacePeriod.periodMonth <= currentPeriod.periodMonth)
          .map((workspacePeriod) => workspacePeriod.id),
      )
    : Promise.resolve(new Map());
  let purchases: PurchaseView[] = [];
  let accountOptions: AccountView[] = [];
  let accountHistory: AccountOverviewAccount[] = [];
  let dailyControls: PersistedDailyControl[] = [];
  let operationEntryHistory: OperationRegisterEntry[] = [];
  let phaseWithdrawalHistory: AccountPhaseWithdrawal[] = [];
  let approvedPayoutHistory: AccountOverviewPayout[] = [];
  let walletMovements: WalletMovement[] = [];
  let walletViews: WalletView[] = [];
  let walletIdentities: WalletIdentityView[] = [];
  let fundingWithdrawals: FundingWithdrawal[] = [];
  let operationalSummary: OperationalSummary = buildOperationalSummary({
    accounts: [], controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
  });
  let capitalHistory: CapitalHistoryPoint[] = [];
  let homePerformance: HomePerformance = buildHomePerformance([]);
  let homeDailyHistory = buildHomeDailyHistory([]);
  let personalDashboard: PersonalDashboardData | undefined;
  let accountingPeriods: AccountingPeriodView[] = [];
  let economicTrace: EconomicTraceItem[] = [];
  let identityAccounts: IdentityAccount[] = [];
  let identitySummaries: IdentitySummary[] = [];
  let identitySignalStates: Record<string, boolean> = {};
  let unclaimedBrokerAccounts: Array<{ accountName: string; connectionName: string; physicalConnectorId: string; proposedDestinationConnectorId: string }> = [];
  let openingSnapshot: PeriodOpeningRecord | null = null;
  let openingSetupEligible = false;
  let periodOpening: OperationalOpeningSnapshot = {
    accumulatedResultInCents: 0,
    brokerBalanceInCents: null,
    capitalNetInCents: 0,
    fundingPendingInCents: 0,
    walletBalanceInCents: 0,
  };

  if (allowed && selection?.period) {
    const [
      { data: companyRows },
      { data: accountRows },
      { data: purchaseRows },
      { data: dailyControlRows },
      { data: dailyControlParticipantRows },
      { data: walletMovementRows },
      { data: ninjaLinkRows },
      { data: ninjaAccountRegistrationExclusionRows },
      { data: ninjaInventoryRows },
      { data: ninjaOperationProbeRows },
      { data: ninjaReconciliationRows },
      { data: ninjaTransitionRows },
      { data: ninjaRegistrationTransitionRows },
      { data: ninjaBrokerBalanceRows },
      { data: ninjaBrokerAccountAliasRows },
      { data: unclaimedBrokerRows },
      { data: historicalPurchaseRows },
      { data: historicalAccountRows },
      { data: historicalOperationEntryRows },
      { data: historicalPhaseWithdrawalRows },
      { data: historicalControlRows },
      { data: historicalWalletMovementRows },
      { data: historicalFundingWithdrawalRows },
      { data: walletRows },
      { data: walletSourceRows },
      { data: openingSnapshotRows },
      { data: openingBatchRows },
      { data: openingWalletRows },
    ] =
      await Promise.all([
        supabase
          .from("companies")
          .select("id, code, display_name")
          .eq("is_active", true)
          .order("code"),
        supabase
          .from("accounts")
          .select("id, company_id, reference_number, state, state_origin")
          .eq("period_id", selection.period.id),
        supabase
          .from("purchases")
          .select(
            "id, account_id, purchase_number, purchased_on, price_cents, funds_origin, wallet_id",
          )
          .eq("period_id", selection.period.id)
          .order("purchase_number", { ascending: false }),
        supabase
          .from("daily_controls")
          .select(
            "id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, is_uncovered, allocation_reason, source, source_event_key, created_at, wallet_id, transfer_fee_cents",
          )
          .eq("period_id", selection.period.id)
          .order("control_number"),
        supabase
          .from("daily_control_participants")
          .select("daily_control_id, account_id, role, allocated_result_cents")
          .eq("period_id", selection.period.id),
        supabase
          .from("wallet_movements")
          .select("id, wallet_id, destination_wallet_id, daily_control_id, occurred_on, kind, amount_cents, fee_cents, observation, created_at")
          .eq("period_id", selection.period.id)
          .order("occurred_on", { ascending: false }),
        supabase
          .from("ninja_account_links")
          .select("account_id, connector_id, connection_name, external_account_name, phase, closed_at, linked_at")
          .order("linked_at"),
        supabase
          .from("ninja_account_registration_exclusions")
          .select("connector_id,connection_name,external_account_name"),
        supabase.rpc("get_current_user_ninja_inventory"),
        supabase.rpc("get_current_user_ninja_operation_probe_sessions", { target_limit: 100 }),
        supabase.rpc("get_current_user_ninja_reconciliation_details", { target_limit: 100 }),
        supabase.rpc("get_current_user_ninja_change_events", { target_limit: 8 }),
        supabase
          .from("ninja_account_change_events")
          .select("connector_id,occurred_at,connection_name,event_type,resolution_status,to_account_name")
          .order("occurred_at", { ascending: false })
          .limit(500),
        supabase
          .from("ninja_broker_balance_events")
          .select("id, observed_at, balance_cents, source_accounts, source_event_id")
          .order("observed_at", { ascending: false })
          .limit(30),
        supabase
          .from("ninja_broker_account_aliases")
          .select("connection_name,account_name,display_name"),
        supabase
          .from("ninja_unclaimed_broker_accounts")
          .select("physical_connector_id,connection_name,account_name,proposed_destination_connector_id"),
        supabase
          .from("purchases")
          .select("id, account_id, period_id, purchase_number, purchased_on, price_cents, funds_origin, wallet_id")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("accounts")
          .select("id, period_id, company_id, reference_number, state, state_origin")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("operation_entries")
          .select("id, daily_control_id, period_id, account_id, operated_on, phase, participant_role, destination, magnitude_cents, created_at")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id))
          .order("operated_on", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("account_phase_withdrawals")
          .select("period_id, account_id, phase, total_withdrawal_cents")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("daily_controls")
          .select("period_id, control_number, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, wallet_id, transfer_fee_cents")
          .order("period_id")
          .order("control_number")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("wallet_movements")
          .select("id, period_id, wallet_id, destination_wallet_id, daily_control_id, occurred_on, kind, amount_cents, fee_cents, observation")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("funding_withdrawals")
          .select("id, period_id, collected_period_id, account_result_applied_period_id, receipt_timing_v2, account_id, phase, approved_on, amount_cents, collected_on, wallet_id, collection_fee_cents, created_at")
          .eq("is_active", true)
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("nodal_wallets")
          .select("id,name")
          .eq("workspace_id", selection.workspace.id)
          .eq("is_active", true)
          .order("created_at"),
        supabase
          .from("nodal_wallet_sources")
          .select("wallet_id,identity_id,address,observed_cents")
          .eq("workspace_id", selection.workspace.id),
        supabase
          .from("period_opening_snapshots")
          .select("id,period_id,start_mode,cutover_date,broker_balance_cents,wallet_balance_cents,funding_pending_cents,contributed_capital_cents,personal_withdrawals_cents,prior_realized_result_cents,floating_cents,virgin_accounts,live_evaluation_accounts,funded_accounts,closed_accounts_reference")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("period_opening_account_batches")
          .select("opening_snapshot_id,company_name,account_size_cents,stage,account_count,cost_per_account_cents,current_cash_value_cents"),
        supabase
          .from("period_opening_wallets")
          .select("opening_snapshot_id,wallet_id,balance_cents,nodal_wallets(name)"),
      ]);
    const walletSourceById = new Map((walletSourceRows ?? []).map((source) => [source.wallet_id, source]));
    walletViews = await Promise.all((walletRows ?? []).map(async (wallet) => {
      const { data } = await supabase.rpc("calculate_nodal_wallet_balance", { target_wallet_id: wallet.id });
      const source = walletSourceById.get(wallet.id);
      return {
        automatic: Boolean(source?.address),
        balanceInCents: Number(data ?? 0),
        id: wallet.id,
        identityId: source?.identity_id ?? null,
        name: wallet.name,
        observedBalanceInCents: source?.observed_cents === null || source?.observed_cents === undefined
          ? null
          : Number(source.observed_cents),
      };
    }));
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const privileged = serviceUrl && serviceKey ? createServiceClient(serviceUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) : null;
    const accountIds = (historicalAccountRows ?? []).map((account) => account.id);
    const [historicalManualAccountBalanceRows, technicalMemberRows] = privileged ? await Promise.all([
      privileged.from("manual_account_balance_observations")
        .select("account_id, period_id, initial_balance_cents, cash_value_cents, trade_number, observed_at, created_at")
        .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id))
        .order("observed_at", { ascending: false }).order("created_at", { ascending: false })
        .then(({ data }) => data ?? []),
      accountIds.length ? privileged.from("ninja_operation_batch_members")
        .select("account_id,batch_id,session_id,allocated_broker_result_cents,role")
        .in("account_id", accountIds).eq("role", "prop")
        .then(({ data }) => data ?? []) : Promise.resolve([]),
    ]) : [[], []];
    const technicalSessionIds = technicalMemberRows.map((row) => row.session_id);
    const technicalBatchIds = [...new Set(technicalMemberRows.map((row) => row.batch_id))];
    const technicalSessionRows = privileged && technicalSessionIds.length
      ? (await privileged.from("ninja_operation_probe_sessions")
          .select("id,account_name,result,opened_at")
          .in("id", technicalSessionIds).order("opened_at")).data ?? []
      : [];
    const technicalBatchRows = privileged && technicalBatchIds.length
      ? (await privileged.from("ninja_operation_batches")
          .select("id,daily_control_id")
          .in("id", technicalBatchIds).not("daily_control_id", "is", null)).data ?? []
      : [];

    companies = (companyRows ?? []).map((company) => ({
      code: company.code,
      displayName: company.display_name,
      id: company.id,
    }));
    const activeNinjaLinks = (ninjaLinkRows ?? []).filter((link) => link.closed_at === null);
    const registeredNinjaAccountNames = new Set(activeNinjaLinks.map((link) => link.external_account_name));
    registeredNinjaAccountKeys = resolveRegisteredNinjaAccountKeys(
      (ninjaLinkRows ?? []).map((link) => ({
        accountName: link.external_account_name,
        connectionName: link.connection_name,
        connectorId: link.connector_id,
        linkedAt: link.linked_at,
      })),
      (ninjaRegistrationTransitionRows ?? []).map((transition) => ({
        connectorId: transition.connector_id,
        connectionName: transition.connection_name,
        eventType: transition.event_type,
        occurredAt: transition.occurred_at,
        resolutionStatus: transition.resolution_status,
        toAccountName: transition.to_account_name,
      })),
    );
    excludedNinjaAccountKeys = new Set((ninjaAccountRegistrationExclusionRows ?? []).map((exclusion) =>
      ninjaAccountRegistrationKey(exclusion.connector_id, exclusion.connection_name, exclusion.external_account_name),
    ));
    const excludedNinjaAccountNames = new Set(
      (ninjaAccountRegistrationExclusionRows ?? []).map((exclusion) => exclusion.external_account_name),
    );
    ninjaNamesByAccountId = new Map(activeNinjaLinks.map((link) => [link.account_id, link.external_account_name]));
    ninjaConnectionNamesByAccountId = new Map(
      (ninjaLinkRows ?? []).map((link) => [link.account_id, link.connection_name]),
    );
    ninjaOperationalStatesByAccountId = new Map(activeNinjaLinks.flatMap((link) =>
      link.phase === "Evaluation" || link.phase === "Funded" || link.phase === "Live"
        ? [[link.account_id, link.phase] as const]
        : [],
    ));
    ninjaInventories = (ninjaInventoryRows ?? []) as NinjaInventoryRpcRow[];
    const latestNinjaAccounts = new Map<string, {
      account: NinjaAccountSnapshot & { firstSeenAt?: string };
      observedAt: string;
    }>(ninjaInventories.flatMap((inventory) =>
      inventory.accounts.map((account) => [`${account.connectionName}\u0000${account.accountName}`, {
        account,
        observedAt: inventory.observed_at,
      }] as const),
    ));
    const technicalSessions = (ninjaOperationProbeRows ?? []) as NinjaOperationProbeRpcRow[];
    hasPendingNinjaOperation = technicalSessions.some((session) => session.status === "open" || session.status === "settling")
      || ((ninjaReconciliationRows ?? []) as NinjaReconciliationRpcRow[])
        .some((batch) => batch.accounting_status !== "committed");
    const technicalSessionsByAccount = new Map<string, NinjaOperationProbeRpcRow[]>();
    for (const session of technicalSessions) {
      const key = `${session.connection_name}\u0000${session.account_name}`;
      technicalSessionsByAccount.set(key, [...(technicalSessionsByAccount.get(key) ?? []), session]);
    }
    ninjaAccountBalances = new Map((ninjaLinkRows ?? []).flatMap((link) => {
      const key = `${link.connection_name}\u0000${link.external_account_name}`;
      const latest = latestNinjaAccounts.get(key);
      const sessions = technicalSessionsByAccount.get(key) ?? [];
      const lastClosedBalance = sessions.find((session) => session.closing_balance !== null)?.closing_balance ?? null;
      const lastMinimumNetLiquidation = sessions.find((session) => session.minimum_net_liquidation !== null)?.minimum_net_liquidation ?? null;
      const accountForClassification: NinjaAccountSnapshot = latest?.account ?? {
        accountName: link.external_account_name,
        cashValue: null,
        connectionName: link.connection_name,
        connectionStatus: "Disconnected",
        netLiquidation: null,
        providerName: "NinjaTrader",
        realizedProfitLoss: null,
        totalCashBalance: null,
        unrealizedProfitLoss: null,
      };
      const classification = classifyNinjaAccount(accountForClassification, latest?.observedAt ?? new Date().toISOString());
      return [[link.account_id, {
        currentInCents: latest?.account.cashValue !== null && latest?.account.cashValue !== undefined
          ? Math.round(latest.account.cashValue * 100)
          : lastClosedBalance === null ? null : Math.round(Number(lastClosedBalance) * 100),
        initialInCents: classification.type === "prop" ? classification.accountSizeInCents : null,
        minimumNetLiquidationInCents: lastMinimumNetLiquidation === null ? null : Math.round(Number(lastMinimumNetLiquidation) * 100),
        technicalTradeCount: sessions.length,
      }] as const];
    }));
    unclaimedBrokerAccounts = (unclaimedBrokerRows ?? []).flatMap((row) =>
      row.proposed_destination_connector_id ? [{
        accountName: row.account_name,
        connectionName: row.connection_name,
        physicalConnectorId: row.physical_connector_id,
        proposedDestinationConnectorId: row.proposed_destination_connector_id,
      }] : []);
    ninjaInventoryRevision = buildNinjaInventoryRevision(ninjaInventories);
    const connectedNinjaAccounts = ninjaInventories.flatMap((inventory) =>
      inventory.accounts.filter(
        (account) => account.connectionStatus.toLowerCase() === "connected",
      ),
    );
    const connectedBrokerAccounts = connectedNinjaAccounts.filter(
      (account) =>
        classifyNinjaAccount(account, account.firstSeenAt ?? new Date().toISOString()).type ===
        "broker",
    );
    const connectedPropAccounts = connectedNinjaAccounts.filter(
      (account) =>
        classifyNinjaAccount(account, account.firstSeenAt ?? new Date().toISOString()).type ===
        "prop",
    );
    connectedNinjaBrokerAccountNames = connectedBrokerAccounts.map((account) => account.accountName);
    connectedNinjaPropAccountNames = connectedPropAccounts.map((account) => account.accountName);
    liveNinjaBrokerBalance = applyNinjaBrokerAccountAliases(
      buildNinjaLiveBrokerBalance(ninjaInventories),
      (ninjaBrokerAccountAliasRows ?? []).map((alias): NinjaBrokerAccountAlias => ({
        accountName: alias.account_name,
        connectionName: alias.connection_name,
        displayName: alias.display_name,
      })),
    );
    if (connectedNinjaAccounts.length > 0 && connectedBrokerAccounts.length === 0) {
      ninjaBrokerSourceNotice =
        "NinjaTrader está conectado, pero no informa ninguna cuenta broker. Los saldos automáticos se reanudarán cuando una cuenta broker vuelva a aparecer en Accounts.";
    }
    ninjaTransitionAlerts = ((ninjaTransitionRows ?? []) as NinjaTransitionRpcRow[])
      .filter((row) => !(row.event_type === "new_account" && row.to_account_name
        && (registeredNinjaAccountNames.has(row.to_account_name) || excludedNinjaAccountNames.has(row.to_account_name))))
      .map((row) => ({
        automatic: row.automatic,
        connectionName: row.connection_name,
        eventType: row.event_type,
        fromAccountName: row.from_account_name,
        id: row.id,
        occurredAt: row.occurred_at,
        reason: row.reason,
        resolutionStatus: row.resolution_status,
        toAccountName: row.to_account_name,
      }));
    const brokerRowsAscending = [...((ninjaBrokerBalanceRows ?? []) as NinjaBrokerBalanceRpcRow[])].reverse();
    ninjaBrokerBalanceHistory = brokerRowsAscending.map((row, index) => {
      const previous = index === 0 ? null : Number(brokerRowsAscending[index - 1].balance_cents);
      const balance = Number(row.balance_cents);
      return {
        balanceInCents: balance,
        changeInCents: previous === null ? null : balance - previous,
        id: row.id,
        kind: row.source_event_id.startsWith("ninja-operation:") ? "operation" as const : "initial" as const,
        observedAt: row.observed_at,
        previousBalanceInCents: previous,
      };
    }).reverse();
    incomingNinjaBalance = null;
    const accountsById = new Map(
      (accountRows ?? []).map((account) => [account.id, account]),
    );
    const companiesById = new Map(
      (companyRows ?? []).map((company) => [company.id, company]),
    );
    const purchasesByAccountId = new Map(
      (historicalPurchaseRows ?? []).map((purchase) => [purchase.account_id, purchase]),
    );
    accountOptions = (accountRows ?? []).flatMap((account) => {
      const company = companiesById.get(account.company_id);
      if (!company) return [];
      const purchase = purchasesByAccountId.get(account.id);
      return [
        {
          companyId: account.company_id,
          companyName: company.display_name,
          externalName: ninjaNamesByAccountId.get(account.id) ?? null,
          fundsOrigin: purchase?.funds_origin ?? null,
          id: account.id,
          priceInCents: purchase ? Number(purchase.price_cents) : null,
          purchaseNumber: purchase?.purchase_number ?? null,
          purchasedOn: purchase?.purchased_on ?? null,
          referenceNumber: account.reference_number,
          state: account.state as AccountView["state"],
          stateOrigin: account.state_origin as AccountView["stateOrigin"],
        },
      ];
    });

    purchases = (purchaseRows ?? []).flatMap((purchase) => {
      const account = accountsById.get(purchase.account_id);
      const company = account ? companiesById.get(account.company_id) : null;
      if (!account || !company) return [];

      return [
        {
          companyCode: company.code,
          externalName: ninjaNamesByAccountId.get(account.id) ?? null,
          fundsOrigin: purchase.funds_origin,
          id: purchase.id,
          priceCents: Number(purchase.price_cents),
          purchaseNumber: purchase.purchase_number,
          purchasedOn: purchase.purchased_on,
          referenceNumber: account.reference_number,
          state: account.state,
        },
      ];
    });
    const participantsByControlId = new Map<string, PersistedDailyControl["participants"]>();
    for (const participant of dailyControlParticipantRows ?? []) {
      const account = accountsById.get(participant.account_id);
      if (!account) continue;
      const current = participantsByControlId.get(participant.daily_control_id) ?? [];
      current.push({
        accountId: participant.account_id,
        accountReference: account.reference_number,
        amountInCents: Number(participant.allocated_result_cents),
        role: participant.role,
      });
      participantsByControlId.set(participant.daily_control_id, current);
    }
    dailyControls = (dailyControlRows ?? []).map((control) => ({
      isUncovered: control.is_uncovered,
      allocationReason: control.allocation_reason,
      balanceInCents: Number(control.balance_after_cents),
      controlId: control.id,
      id: control.control_number,
      kind: control.kind,
      movementInCents:
        control.movement_cents === null ? null : Number(control.movement_cents),
      operatingResultInCents:
        control.operating_result_cents === null
          ? null
          : Number(control.operating_result_cents),
      valueInCents:
        control.kind === "balance_update"
          ? Number(control.balance_after_cents)
          : Number(control.movement_cents),
      participants: (participantsByControlId.get(control.id) ?? []).sort((left, right) =>
        left.role === right.role ? left.accountReference - right.accountReference : left.role === "leader" ? -1 : 1,
      ),
      operatedOn: control.operated_on,
    }));
    const historicalPeriodsById = new Map(
      selection.workspace.periods.map((period) => [period.id, period] as const),
    );
    const historicalAccountsById = new Map(
      (historicalAccountRows ?? []).map((account) => [account.id, account]),
    );
    const historicalPurchasesByAccountId = new Map(
      (historicalPurchaseRows ?? []).map((purchase) => [purchase.account_id, purchase]),
    );
    const manualBalanceByAccountId = new Map<string, {
      cashValueInCents: number;
      initialBalanceInCents: number;
      tradeCount: number;
    }>();
    for (const observation of historicalManualAccountBalanceRows ?? []) {
      if (manualBalanceByAccountId.has(observation.account_id)) continue;
      manualBalanceByAccountId.set(observation.account_id, {
        cashValueInCents: Number(observation.cash_value_cents),
        initialBalanceInCents: Number(observation.initial_balance_cents),
        tradeCount: Number(observation.trade_number),
      });
    }
    accountHistory = (historicalAccountRows ?? []).flatMap((account) => {
      const company = companiesById.get(account.company_id);
      const purchase = historicalPurchasesByAccountId.get(account.id);
      const period = historicalPeriodsById.get(account.period_id);
      if (!company || !period) return [];
      const ninjaBalance = ninjaAccountBalances.get(account.id);
      const manualBalance = manualBalanceByAccountId.get(account.id);
      const purchaseCost = purchase ? Number(purchase.price_cents) : 0;
      let accumulated = -purchaseCost;
      const sessionById = new Map(technicalSessionRows.map((session) => [Number(session.id), session]));
      const controlByBatchId = new Map(technicalBatchRows.flatMap((batch) =>
        batch.daily_control_id ? [[batch.id, batch.daily_control_id] as const] : [],
      ));
      const technicalRows = technicalMemberRows
        .filter((member) => member.account_id === account.id)
        .flatMap((member) => {
          const session = sessionById.get(Number(member.session_id));
          const dailyControlId = controlByBatchId.get(member.batch_id);
          if (!session || !dailyControlId) return [];
          return [{
            broker: Number(member.allocated_broker_result_cents ?? 0),
            date: session.opened_at,
            dailyControlId,
            prop: session.result === null ? null : Math.round(Number(session.result) * 100),
          }];
        })
        .sort((left, right) => left.date.localeCompare(right.date));
      const economicHistory: NonNullable<AccountOverviewAccount["economicHistory"]> = [{
        accumulatedInCents: accumulated, brokerResultInCents: null, concept: "Examen",
        phase: "—", propResultInCents: null, tradeNumber: null,
      }];
      const detectedHistory = buildDetectedAccountEconomicHistory({
        accumulatedInCents: accumulated,
        accountingEntries: (historicalOperationEntryRows ?? [])
          .filter((entry) => entry.account_id === account.id)
          .map((entry) => ({ dailyControlId: entry.daily_control_id, phase: entry.phase })),
        trades: technicalRows.map((row) => ({
          brokerResultInCents: row.broker,
          dailyControlId: row.dailyControlId,
          openedAt: row.date,
          propResultInCents: row.prop,
        })),
      });
      detectedHistory.forEach((row) => economicHistory.push({ ...row, concept: "Cobertura" }));
      accumulated = detectedHistory.at(-1)?.accumulatedInCents ?? accumulated;
      if (technicalRows.length === 0) {
        const manualBalances = [...(historicalManualAccountBalanceRows ?? [])]
          .filter((row) => row.account_id === account.id)
          .sort((left, right) => left.trade_number - right.trade_number || left.observed_at.localeCompare(right.observed_at))
          .map((row) => ({
            cashValueInCents: Number(row.cash_value_cents),
            initialBalanceInCents: Number(row.initial_balance_cents),
            tradeNumber: Number(row.trade_number),
          }));
        const manualBrokerEntries = [...(historicalOperationEntryRows ?? [])]
          .filter((entry) => entry.account_id === account.id)
          .sort((left, right) => left.operated_on.localeCompare(right.operated_on) || left.created_at.localeCompare(right.created_at))
          .map((entry) => ({
            brokerResultInCents: entry.destination === "NETO BROKER +"
              ? Number(entry.magnitude_cents)
              : entry.destination === "NETO BROKER -" ? -Number(entry.magnitude_cents) : 0,
            phase: entry.phase,
          }));
        const manualHistory = buildManualAccountEconomicHistory({
          accumulatedInCents: accumulated,
          balanceHistory: manualBalances,
          brokerHistory: manualBrokerEntries,
        });
        manualHistory.forEach((row) => economicHistory.push({
          ...row,
          concept: "Cobertura",
        }));
        accumulated = manualHistory.at(-1)?.accumulatedInCents ?? accumulated;
      }
      (historicalFundingWithdrawalRows ?? []).filter((row) => row.account_id === account.id && row.collected_on).forEach((row) => {
        const net = Number(row.amount_cents) - Number(row.collection_fee_cents ?? 0);
        accumulated += net;
        economicHistory.push({ accumulatedInCents: accumulated, brokerResultInCents: null, concept: "Payout",
          phase: row.phase ?? "Funded", propResultInCents: null, tradeNumber: null });
      });
      const hasRecordedActivity = Boolean(manualBalance)
        || (ninjaBalance?.technicalTradeCount ?? 0) > 0
        || (historicalOperationEntryRows ?? []).some((entry) => entry.account_id === account.id)
        || (historicalFundingWithdrawalRows ?? []).some((withdrawal) => withdrawal.account_id === account.id)
        || (historicalPhaseWithdrawalRows ?? []).some((withdrawal) => withdrawal.account_id === account.id)
        || technicalMemberRows.some((member) => member.account_id === account.id);
      return [{
        canDelete: (account.state === "virgin" || account.state === "closed")
          && !hasRecordedActivity,
        canEditPurchase: Boolean(purchase) && !hasRecordedActivity,
        companyId: account.company_id,
        companyName: company.display_name,
        currentCashValueInCents: ninjaBalance?.currentInCents ?? manualBalance?.cashValueInCents ?? null,
        currentOperationalState: ninjaOperationalStatesByAccountId.get(account.id) ?? null,
        externalName: ninjaNamesByAccountId.get(account.id) ?? null,
        economicHistory,
        fundsOrigin: purchase?.funds_origin ?? null,
        id: account.id,
        initialBalanceInCents: ninjaBalance?.initialInCents ?? manualBalance?.initialBalanceInCents ?? null,
        minimumNetLiquidationInCents: ninjaBalance?.minimumNetLiquidationInCents ?? null,
        ninjaConnectionName: ninjaConnectionNamesByAccountId.get(account.id) ?? null,
        periodLabel: formatPeriodLabel(period.periodMonth),
        periodMonth: period.periodMonth,
        priceInCents: purchase ? Number(purchase.price_cents) : null,
        purchaseNumber: purchase?.purchase_number ?? null,
        purchaseWalletId: purchase?.wallet_id ?? null,
        purchasedOn: purchase?.purchased_on ?? null,
        referenceNumber: account.reference_number,
        state: account.state as AccountView["state"],
        stateOrigin: account.state_origin as AccountView["stateOrigin"],
        technicalTradeCount: ninjaBalance?.technicalTradeCount ?? manualBalance?.tradeCount ?? 0,
      }];
    });
    operationEntryHistory = (historicalOperationEntryRows ?? []).flatMap((entry) => {
      const account = historicalAccountsById.get(entry.account_id);
      const company = account ? companiesById.get(account.company_id) : null;
      if (!account || !company) return [];
      return [{
        accountId: account.id,
        accountReference: account.reference_number,
        companyId: company.id,
        companyName: company.display_name,
        dailyControlId: entry.daily_control_id,
        destination: entry.destination,
        id: entry.id,
        magnitudeInCents: Number(entry.magnitude_cents),
        operatedOn: entry.operated_on,
        participantRole: entry.participant_role,
        phase: entry.phase,
      }];
    });
    phaseWithdrawalHistory = (historicalPhaseWithdrawalRows ?? []).flatMap((withdrawal) =>
      withdrawal.phase === "Evaluacion" ? [] : [{
        accountId: withdrawal.account_id,
        phase: withdrawal.phase as AccountPhaseWithdrawal["phase"],
        totalWithdrawalInCents: Number(withdrawal.total_withdrawal_cents),
      }],
    );
    approvedPayoutHistory = (historicalFundingWithdrawalRows ?? []).flatMap((withdrawal) =>
      withdrawal.phase && withdrawal.phase !== "Evaluacion"
        ? [{
            accountId: withdrawal.account_id,
            amountInCents: Number(withdrawal.amount_cents),
            approvedOn: withdrawal.approved_on,
            id: withdrawal.id,
            phase: withdrawal.phase as AccountOverviewPayout["phase"],
          }]
        : [],
    );
    walletMovements = (walletMovementRows ?? []).map((movement) => ({
      amountInCents: Number(movement.amount_cents), id: movement.id,
      dailyControlId: movement.daily_control_id,
      destinationWalletId: movement.destination_wallet_id,
      kind: movement.kind as WalletMovement["kind"], occurredOn: movement.occurred_on,
      observation: movement.observation,
      feeInCents: Number(movement.fee_cents ?? 0),
      walletId: movement.wallet_id,
    }));
    fundingWithdrawals = (historicalFundingWithdrawalRows ?? [])
      .filter((withdrawal) => !withdrawal.collected_on
        || withdrawal.period_id === selection.period!.id
        || withdrawal.collected_period_id === selection.period!.id)
      .map((withdrawal) => ({
      accountId: withdrawal.account_id, amountInCents: Number(withdrawal.amount_cents),
      accountResultAppliedInPeriod: withdrawal.receipt_timing_v2
        ? withdrawal.account_result_applied_period_id === selection.period!.id
        : undefined,
      approvalBelongsToPeriod: withdrawal.receipt_timing_v2
        ? withdrawal.period_id === selection.period!.id
        : undefined,
      approvedOn: withdrawal.approved_on, collectedOn: withdrawal.collected_on, id: withdrawal.id,
      collectionBelongsToPeriod: withdrawal.receipt_timing_v2
        ? withdrawal.collected_period_id === selection.period!.id
        : undefined,
      feeInCents: Number(withdrawal.collection_fee_cents ?? 0),
      phase: withdrawal.phase,
      walletId: withdrawal.wallet_id,
    }));
    const [
      { data: identityRows },
      { data: identityAssignmentRows },
      { data: identityConnectorInstallationRows },
      { data: identitySignalRows },
    ] = await Promise.all([
      supabase
        .from("nodal_identities")
        .select("id,first_name,last_name,contact_email,onboarding_status,documentation_status,credentials_status,drive_folder_url")
        .eq("workspace_id", selection.workspace.id)
        .order("last_name")
        .order("first_name"),
      supabase
        .from("identity_account_assignments")
        .select("identity_id,account_id")
        .eq("workspace_id", selection.workspace.id)
        .is("unassigned_at", null),
      supabase
        .from("identity_connector_installations")
        .select("identity_id,status,expires_at,sent_at,created_at")
        .eq("workspace_id", selection.workspace.id)
        .in("status", ["sending", "sent", "downloaded"])
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("ninja_identity_signal_controls")
        .select("identity_id,is_enabled"),
    ]);
    identitySignalStates = Object.fromEntries((identitySignalRows ?? []).map((row) => [row.identity_id, row.is_enabled]));
    const identityByAccountId = new Map(
      (identityAssignmentRows ?? []).map((assignment) => [assignment.account_id, assignment.identity_id]),
    );
    identityAccounts = accountHistory.map((account) => ({
      balanceInCents: account.currentCashValueInCents,
      currentIdentityId: identityByAccountId.get(account.id) ?? null,
      history: account.economicHistory ?? [],
      id: account.id,
      label: `${account.companyName} · ${account.externalName ?? `Cuenta ${account.referenceNumber}`}`,
      operationalState: account.currentOperationalState,
      payoutInCents: (historicalFundingWithdrawalRows ?? [])
        .filter((withdrawal) => withdrawal.account_id === account.id)
        .reduce((total, withdrawal) => total + Number(withdrawal.amount_cents), 0),
      resultInCents: account.economicHistory?.at(-1)?.accumulatedInCents ?? 0,
      state: account.state,
      tradeCount: account.technicalTradeCount,
    }));
    identitySummaries = buildIdentitySummaries(
      (identityRows ?? []).map((identity): ManagedIdentity => ({
        contactEmail: identity.contact_email,
        credentialsStatus: identity.credentials_status,
        documentationStatus: identity.documentation_status,
        driveFolderUrl: identity.drive_folder_url,
        firstName: identity.first_name,
        id: identity.id,
        lastName: identity.last_name,
        onboardingStatus: identity.onboarding_status,
      })),
      identityAccounts,
      (identityConnectorInstallationRows ?? []).map((installation): IdentityConnectorInstallation => ({
        createdAt: installation.created_at,
        expiresAt: installation.expires_at,
        identityId: installation.identity_id,
        sentAt: installation.sent_at,
        status: installation.status as IdentityConnectorInstallation["status"],
      })),
      walletViews,
    );
    walletIdentities = (identityRows ?? []).map((identity) => ({
      id: identity.id,
      name: `${identity.first_name} ${identity.last_name}`,
    }));
    economicTrace = [
      ...(dailyControlRows ?? []).flatMap((control): EconomicTraceItem[] =>
        control.kind === "balance_update" || control.movement_cents === null || control.wallet_id ? [] : [{
          amountInCents: Number(control.movement_cents),
          date: control.operated_on,
          id: `broker-${control.id}`,
          label: control.kind === "deposit" ? "Depósito broker" : "Retiro broker",
          source: control.source === "ninjatrader" ? "Automático" : "Manual",
          status: control.origin_destination,
        }],
      ),
    ].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
    const openingRecords: (PeriodOpeningRecord & { periodId: string })[] = (openingSnapshotRows ?? []).map((row) => ({
      batches: (openingBatchRows ?? []).filter((batch) => batch.opening_snapshot_id === row.id).map((batch) => ({
        accountCount: Number(batch.account_count),
        accountSizeInCents: Number(batch.account_size_cents),
        companyName: batch.company_name,
        costPerAccountInCents: Number(batch.cost_per_account_cents),
        currentCashValueInCents: batch.current_cash_value_cents === null ? null : Number(batch.current_cash_value_cents),
        stage: batch.stage as OpeningAccountStage,
      })),
      brokerBalanceInCents: row.broker_balance_cents === null ? null : Number(row.broker_balance_cents),
      closedAccountsReference: Number(row.closed_accounts_reference),
      contributedCapitalInCents: Number(row.contributed_capital_cents),
      cutoverDate: row.cutover_date,
      floatingInCents: Number(row.floating_cents),
      fundedAccounts: Number(row.funded_accounts),
      fundingPendingInCents: Number(row.funding_pending_cents),
      id: row.id,
      liveEvaluationAccounts: Number(row.live_evaluation_accounts),
      mode: row.start_mode as PeriodOpeningRecord["mode"],
      periodId: row.period_id,
      personalWithdrawalsInCents: Number(row.personal_withdrawals_cents),
      inferredResultInCents: Number(row.prior_realized_result_cents),
      virginAccounts: Number(row.virgin_accounts),
      walletBalanceInCents: Number(row.wallet_balance_cents),
      wallets: (openingWalletRows ?? []).filter((wallet) => wallet.opening_snapshot_id === row.id).map((wallet) => ({
        balanceInCents: Number(wallet.balance_cents),
        id: wallet.wallet_id,
        name: wallet.nodal_wallets[0]?.name ?? "Billetera",
      })),
    }));
    openingSnapshot = openingRecords.find((record) => record.periodId === selection.period!.id) ?? null;
    const [loadedPersonalDashboard, loadedAccountingPeriods] = await Promise.all([
      personalDashboardPromise,
      accountingPeriodSummariesPromise,
    ]);
    const loadedCurrent = loadedAccountingPeriods.get(selection.period.id);
    if (!loadedCurrent) throw new Error("No se pudo verificar el resumen contable del período.");
    operationalSummary = loadedCurrent.summary;
    periodOpening = loadedCurrent.opening ?? periodOpening;
    personalDashboard = loadedPersonalDashboard ?? {
      billingInCents: operationalSummary.realizedGainInCents,
      earnings: buildPeriodEarnings({
        ownOperationsInCents: operationalSummary.traderGainInCents,
      }),
      history: [{
        billingInCents: operationalSummary.realizedGainInCents,
        earningsInCents: operationalSummary.traderGainInCents,
        periodMonth: selection.period.periodMonth,
      }],
    };
    accountingPeriods = selection.workspace.periods
      .filter((workspacePeriod) => workspacePeriod.periodMonth <= selection.period!.periodMonth)
      .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth))
      .flatMap((workspacePeriod) => {
        const loaded = loadedAccountingPeriods.get(workspacePeriod.id)?.summary;
        const summary = workspacePeriod.id === selection.period!.id ? operationalSummary : loaded;
        return summary ? [{
          current: workspacePeriod.id === selection.period!.id,
          label: formatPeriodLabel(workspacePeriod.periodMonth),
          summary,
        }] : [];
      });
    const homeDailyResults = (dailyControlRows ?? []).map((control) => ({
      operatedOn: control.operated_on,
      resultInCents: control.operating_result_cents === null
        ? null
        : Number(control.operating_result_cents),
    }));
    homePerformance = buildHomePerformance(homeDailyResults);
    homeDailyHistory = buildHomeDailyHistory(homeDailyResults);
    capitalHistory = buildCapitalHistory({
      periods: selection.workspace.periods
        .filter((workspacePeriod) => workspacePeriod.periodMonth <= selection.period!.periodMonth),
      purchases: (historicalPurchaseRows ?? []).map((purchase) => ({
        fundsOrigin: purchase.funds_origin === "Saldo generado" ? "Saldo generado" : "Aporte trader",
        periodId: purchase.period_id,
        priceInCents: Number(purchase.price_cents),
      })),
      controls: (historicalControlRows ?? []).map((control) => ({
        kind: control.kind,
        movementInCents: control.movement_cents === null ? null : Number(control.movement_cents),
        originDestination: control.origin_destination,
        periodId: control.period_id,
      })),
      walletMovements: (historicalWalletMovementRows ?? []).map((movement) => ({
        amountInCents: Number(movement.amount_cents),
        kind: movement.kind,
        periodId: movement.period_id,
      })),
    });
    openingSetupEligible = canConfigurePeriodOpening({
      accountCount: accountHistory.length,
      dailyControls: (dailyControlRows ?? []).map((control) => ({
        controlNumber: control.control_number,
        kind: control.kind,
        originDestination: control.origin_destination,
        source: control.source,
        sourceEventKey: control.source_event_key,
      })),
      fundingWithdrawalCount: fundingWithdrawals.length,
      hasOpeningSnapshot: openingSnapshot !== null,
      operationEntryCount: operationEntryHistory.length,
      walletMovementCount: walletMovements.length,
    });
  }

  return (
    <AppWorkspace
      administrationScope={administrationScope}
      authorized={allowed}
      avatarUrl={typeof claimsData?.claims.user_metadata?.avatar_url === "string" ? claimsData.claims.user_metadata.avatar_url : null}
      initialView={singleValue(purchaseResult) || singleValue(resetResult) ? "accounts" : "home"}
      userLabel={nodalUser?.display_name || nodalUser?.email || userEmail || "Alumno"}
      username={typeof claimsData?.claims.user_metadata?.username === "string" ? claimsData.claims.user_metadata.username : undefined}
      versionInfo={{
        appRevision: appRelease.revision,
        appVersion: appRelease.version,
        connectorOnline,
        connectorInstalledSourceVersion: ninjaConnector?.installedSourceVersion ?? null,
        connectorVersion: ninjaConnector?.connectorVersion ?? null,
      }}
    >
      <NinjaConnectorMonitor inventoryRevision={ninjaInventoryRevision} online={connectorOnline} />
      {!connectorOnline ? (
        <div className="notice connector-offline-notice" role="status">
          <span>Conector sin señal. Estás viendo los últimos datos guardados.</span>
          <details className="connector-recovery">
            <summary>Volver a vincular</summary>
            <div className="connector-recovery-panel">
              <a className="connector-recovery-download" download href="/api/downloads/ninja-connector">
                Descargar conector
              </a>
              <NinjaConnectorPanel compact connector={ninjaConnector} />
            </div>
          </details>
        </div>
      ) : null}
      <header className="app-header" aria-labelledby="private-title">
        <div className="app-brand-row">
          <a className="app-brand" href="#inicio" aria-label="Ir al inicio">
            <Image alt="NODAL Trading" height={30} priority src="/nodal-trading-lime.png" width={167} />
          </a>
          <ThemeToggle />
          <span className="development-badge">Versión privada de prueba</span>
        </div>

        <div className="app-welcome">
          <div>
            <p className="eyebrow">ESPACIO PRIVADO DEL ALUMNO</p>
            <h1 id="private-title">
              {allowed ? "Panel operativo" : "Identidad verificada"}
            </h1>
            <p className="summary">
              {allowed
                ? "Compras, saldos y operatorias organizados en un solo lugar."
                : "Google confirmo quien sos, pero este usuario todavia no tiene permiso para operar dentro de NODAL."}
            </p>
          </div>
          <div className={`access-summary ${allowed ? "allowed" : "blocked"}`}>
            <span>{allowed ? "Acceso habilitado" : "Acceso pendiente"}</span>
            <small>
              {allowed ? "Identidad verificada con Google" : "Autorización NODAL requerida"}
            </small>
          </div>
        </div>

        {allowed && (
          <nav className="app-navigation" aria-label="Secciones de NODAL App">
            <a href="#inicio">Inicio</a>
            <a href="#cuentas">Cuentas</a>
            <a href="#operaciones">Operaciones</a>
            <a href="#contabilidad">Contabilidad</a>
            <a href="#identidades">Identidades</a>
            {nodalUser?.access_role === "admin" && (
              <Link href="/app/admin">Admin Master</Link>
            )}
            <form action="/auth/logout" className="logout-form" method="post">
              <button type="submit">Cerrar sesión</button>
            </form>
          </nav>
        )}

        {!allowed && (
          <div className="blocked-access-actions">
            <p className="notice">
              Este bloqueo es intencional: iniciar sesión con Google no concede
              acceso automático a la información de NODAL.
            </p>
            <form action="/auth/logout" method="post">
              <button className="secondary-action" type="submit">
                Cerrar sesión y usar otra cuenta
              </button>
            </form>
          </div>
        )}
      </header>

      {allowed && selection?.period && (
        <HomeOverview
          capitalHistory={capitalHistory}
          dashboard={personalDashboard}
          dailyHistory={homeDailyHistory}
          liveBrokerBalance={liveNinjaBrokerBalance}
          ninjaOnline={connectorOnline}
          openingSetupPreview={openingSetupEligible}
          openingSnapshot={openingSnapshot}
          performance={homePerformance}
          periodId={selection.period.id}
          periodLabel={formatPeriodLabel(selection.period.periodMonth)}
          summary={operationalSummary}
        />
      )}

      {allowed && selection?.period && <NinjaTransitionAlerts alerts={ninjaTransitionAlerts} mode={selection.workspace.modality} period={selection.period.periodMonth} periodId={selection.period.id} result={singleValue(transitionResult)} />}

      {allowed && selection?.period && (
        <section className="purchase-panel" id="cuentas" aria-labelledby="purchase-title">
          <div className="purchase-heading">
            <h2 id="purchase-title">Cuentas</h2>
            <p className="purchase-count">
              {purchases.length} {purchases.length === 1 ? "cuenta" : "cuentas"}
            </p>
          </div>

          {singleValue(purchaseResult) &&
            purchaseMessages[singleValue(purchaseResult) ?? ""] && (
              <p
                className={`purchase-message ${
                  singleValue(purchaseResult) === "created" ? "success" : "error"
                }`}
                role="status"
              >
                {purchaseMessages[singleValue(purchaseResult) ?? ""]}
              </p>
            )}

          {singleValue(resetResult) === "completed" ? (
            <p className="purchase-message success" role="status">
              Los datos de prueba de este período se reiniciaron. Podés cargar un caso nuevo.
            </p>
          ) : null}

          {singleValue(resetResult) && resetMessages[singleValue(resetResult) ?? ""] ? (
            <p className="purchase-message error" role="alert">
              {resetMessages[singleValue(resetResult) ?? ""]}
            </p>
          ) : null}

          {singleValue(connectorResult) && connectorMessages[singleValue(connectorResult) ?? ""] ? (
            <p className={`purchase-message ${singleValue(connectorResult) === "revoked" ? "success" : "error"}`} role="status">
              {connectorMessages[singleValue(connectorResult) ?? ""]}
            </p>
          ) : null}

          {ninjaInventories.map((inventory) => {
            const accounts = inventory.accounts.map((account) => classifyNinjaAccount(
              account,
              account.firstSeenAt ?? inventory.observed_at,
            ));
            const companyIds = Object.fromEntries(companies.flatMap((company) => [[company.code.toLowerCase(), company.id], [company.displayName.toLowerCase(), company.id]]));
            return <DetectedNinjaAccounts accounts={accounts} companyIds={companyIds} connectorId={inventory.connector_id} excludedAccountKeys={excludedNinjaAccountKeys} key={inventory.connector_id} registeredAccountKeys={registeredNinjaAccountKeys} mode={selection.workspace.modality} online={connectorOnline} pendingBrokerAccounts={unclaimedBrokerAccounts.filter((account) => account.proposedDestinationConnectorId === inventory.connector_id)} period={selection.period!.periodMonth} periodId={selection.period!.id} wallets={walletViews} />;
          })}

          {openingSnapshot ? <OpeningAccountReferences opening={openingSnapshot} /> : null}

          <AccountsOverview
            accounts={accountHistory}
            entries={operationEntryHistory}
            payouts={approvedPayoutHistory}
            wallets={walletViews}
            withdrawals={phaseWithdrawalHistory}
          />

          <details className="accounting-exception">
            <summary>Registrar manualmente</summary>
            {selection.period.lifecycleStatus === "open" ? (
              <form action={createPurchase} className="purchase-form">
              <input name="mode" type="hidden" value={selection.workspace.modality} />
              <input name="period" type="hidden" value={selection.period.periodMonth} />
              <input name="period_id" type="hidden" value={selection.period.id} />

              <div className="form-field">
                <label htmlFor="company_id">Empresa</label>
                <select id="company_id" name="company_id" required defaultValue="">
                  <option disabled value="">
                    Elegí una empresa
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="price">Precio de compra (USD)</label>
                <input
                  id="price"
                  inputMode="decimal"
                  min="0"
                  name="price"
                  placeholder="Ejemplo: 89,00"
                  required
                  step="0.01"
                  type="number"
                />
              </div>

              <div className="form-field purchase-payment-source">
                <PurchasePaymentFields wallets={walletViews} />
              </div>

              <button className="primary-action" type="submit">
                Registrar cuenta
              </button>
              </form>
            ) : (
              <p className="accounting-exception-note">Este período es de consulta.</p>
            )}
          </details>

          {process.env.NODE_ENV === "development" ? (
            <DevelopmentPeriodReset
              mode={selection.workspace.modality}
              period={selection.period.periodMonth}
              periodId={selection.period.id}
            />
          ) : null}
        </section>
      )}

      {allowed && selection?.period && (
        <section className="operations-view" id="operaciones" aria-labelledby="operations-title">
          <div className="workspace-section-heading">
            <h2 id="operations-title">Operaciones</h2>
          </div>
          {openingSnapshot ? <OpeningOperationReference opening={openingSnapshot} /> : null}
          <DailyControlPreview
            key={ninjaBrokerBalanceHistory[0]?.id ?? "no-ninja-balance"}
            accounts={accountOptions}
            brokerAccountNames={connectedNinjaBrokerAccountNames}
            companies={companies.map((company) => ({
              id: company.id,
              name: company.displayName,
            }))}
            embedded
            initialControls={dailyControls}
            incomingNinjaBalance={incomingNinjaBalance}
            manualCoverageAccounts={accountOptions
              .filter((account) => account.state !== "closed")
              .map((account) => ({
                companyName: account.companyName,
                connectionName: ninjaConnectionNamesByAccountId.get(account.id) ?? null,
                id: account.id,
                label: account.externalName ?? `Cuenta ${account.referenceNumber}`,
                state: account.state,
              }))}
            ninjaBrokerBalanceHistory={ninjaBrokerBalanceHistory}
            initialLiveNinjaBalance={liveNinjaBrokerBalance}
            ninjaBrokerSourceNotice={ninjaBrokerSourceNotice}
            ninjaOnline={connectorOnline}
            openingBalanceInCents={periodOpening.brokerBalanceInCents}
            periodId={selection.period.id}
            propAccountNames={connectedNinjaPropAccountNames}
          />
        </section>
      )}

      {allowed && selection?.period && (
        <section className="accounting-view" id="contabilidad" aria-labelledby="accounting-title">
          <div className="workspace-section-heading">
            <h2 id="accounting-title">Contabilidad</h2>
          </div>
          <ProgressSummary
            accounts={accountHistory.map((account) => {
              const hasFundedEntry = operationEntryHistory.some((entry) =>
                entry.accountId === account.id && entry.phase !== "Evaluacion");
              const operationalState = account.currentOperationalState
                ?? (hasFundedEntry ? "Funded" : "Evaluation");
              return {
                eligibleForPayout: isPayoutEligibleAccount(account.state, operationalState),
                id: account.id,
                label: `${account.companyName} · ${account.externalName ?? `Cuenta ${account.referenceNumber}`}`,
              };
            })}
            economicTrace={economicTrace}
            embedded
            identities={walletIdentities}
            hasPendingNinjaOperation={hasPendingNinjaOperation}
            liveBrokerBalance={liveNinjaBrokerBalance}
            ninjaOnline={connectorOnline}
            periodId={selection.period.id}
            periodLabel={formatPeriodLabel(selection.period.periodMonth)}
            periodOperationalStartOn={selection.period.operationalStartOn}
            periodScheduledCloseAt={selection.period.scheduledCloseAt}
            periods={accountingPeriods}
            payouts={fundingWithdrawals}
            summary={operationalSummary}
            wallets={walletViews}
          />
        </section>
      )}

      {allowed && selection?.period && (
        <IdentitiesWorkspace
          accounts={identityAccounts}
          connectors={ninjaConnectors.filter((connector) => connector.identityId !== null)}
          identities={identitySummaries}
          signalStates={identitySignalStates}
          workspaceId={selection.workspace.id}
        />
      )}

      {allowed && !selection && (
        <p className="notice">
          Tu acceso está habilitado, pero todavía no existe un período operativo.
        </p>
      )}

    </AppWorkspace>
  );
}

export default function PrivateAppPage(props: PrivateAppPageProps) {
  return resolveWithDeadline(
    renderPrivateAppPage(props),
    90_000,
    () => <ConnectionRecovery subject="data" />,
  );
}
