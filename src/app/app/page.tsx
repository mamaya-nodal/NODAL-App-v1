import { applyIndividualCommission } from '@/modules/summary/domain/individual-commission';
import { loadIndividualCommission } from '@/modules/summary/server/individual-commission';
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";
import { loadMyAdministrationScope } from "@/modules/admin/server/administration-scope";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import { classifyNinjaAccount } from "@/modules/ninja/domain/account-classification";
import type { NinjaAccountSnapshot } from "@/modules/ninja/domain/ingestion-payload";
import { buildNinjaLiveBrokerBalance, type NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";
import { buildNinjaInventoryRevision } from "@/modules/ninja/domain/inventory-revision";
import type {
  AccountPhaseWithdrawal,
} from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import {
  buildOperationalSummary,
  type OperationalSummary,
  type FundingWithdrawal,
  type WalletMovement,
} from "@/modules/summary/domain/operational-summary";
import {
  buildCapitalHistory,
  buildHomePerformance,
  type CapitalHistoryPoint,
  type HomePerformance,
} from "@/modules/summary/domain/home-dashboard";
import { buildPeriodOpening } from "@/modules/summary/domain/period-opening";
import type { OperationalOpeningSnapshot } from "@/modules/summary/domain/operational-summary";
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
import {
  OperationRegister,
  type RegisterAccount,
} from "./operation-register";
import { ProgressSummary, type WalletView } from "./progress-summary";
import { ThemeToggle } from "./theme-toggle";
import { AppWorkspace } from "./app-workspace";
import { AccountsOverview, type AccountOverviewAccount } from "./accounts-overview";
import { PurchasePaymentFields } from "./purchase-payment-fields";
import type { AccountingPeriodView, EconomicTraceItem } from "./progress-summary";

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

function currentMonthInBuenosAires(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
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
  is_online: boolean;
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

export default async function PrivateAppPage({
  searchParams,
}: PrivateAppPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: nodalUser } = await supabase
    .from("nodal_users")
    .select("id, email, display_name, access_state, access_role")
    .eq("id", user.id)
    .maybeSingle();

  const decision = decideAccess(
    user.id,
    nodalUser
      ? { id: nodalUser.id, accessState: nodalUser.access_state }
      : null,
  );
  const allowed = decision === "allowed";

  if (!allowed) {
    return <AccessPendingGate email={nodalUser?.email || user.email || "Cuenta de Google"} />;
  }

  const administrationScope = allowed
    ? await loadMyAdministrationScope()
    : { kind: "none" as const };
  const { purchase_result: purchaseResult, reset_result: resetResult, connector_result: connectorResult, transition_result: transitionResult } = await searchParams;
  let workspaceOptions: WorkspaceOption[] = [];
  let companies: Array<{ code: string; displayName: string; id: string }> = [];
  let linkedNinjaAccountNames = new Set<string>();
  let ninjaNamesByAccountId = new Map<string, string>();
  let ninjaInventories: NinjaInventoryRpcRow[] = [];
  let connectedNinjaBrokerAccountNames: string[] = [];
  let connectedNinjaPropAccountNames: string[] = [];
  let ninjaConnector: NinjaConnectorStatus | null = null;
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

  if (allowed) {
    const [{ data: workspaces }, { data: ninjaConnectorRows }] = await Promise.all([
      supabase
        .from("workspaces")
        .select("id, modality, periods(id, period_month)")
        .order("modality"),
      supabase.rpc("get_current_user_ninja_connector_status"),
    ]);

    workspaceOptions = (workspaces ?? []).map((workspace) => ({
      id: workspace.id,
      modality: workspace.modality,
      periods: workspace.periods.map((workspacePeriod) => ({
        id: workspacePeriod.id,
        periodMonth: workspacePeriod.period_month,
      })),
    }));

    const connectorRow = (ninjaConnectorRows?.[0] ?? null) as NinjaConnectorStatusRpcRow | null;
    ninjaConnector = connectorRow ? {
      connectorId: connectorRow.connector_id,
      connectorVersion: connectorRow.connector_version,
      isOnline: connectorRow.is_online,
      lastSeenAt: connectorRow.last_seen_at,
      pairedAt: connectorRow.paired_at,
      status: connectorRow.status,
    } : null;
  }

  const connectorOnline = Boolean(ninjaConnector?.isOnline && ninjaConnector.status === "active");

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
  let purchases: PurchaseView[] = [];
  let accountOptions: AccountView[] = [];
  let accountHistory: AccountOverviewAccount[] = [];
  let dailyControls: PersistedDailyControl[] = [];
  let operationEntries: OperationRegisterEntry[] = [];
  let operationEntryHistory: OperationRegisterEntry[] = [];
  let phaseWithdrawals: AccountPhaseWithdrawal[] = [];
  let phaseWithdrawalHistory: AccountPhaseWithdrawal[] = [];
  let walletMovements: WalletMovement[] = [];
  let walletViews: WalletView[] = [];
  let fundingWithdrawals: FundingWithdrawal[] = [];
  let operationalSummary: OperationalSummary = buildOperationalSummary({
    accounts: [], controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
  });
  let capitalHistory: CapitalHistoryPoint[] = [];
  let homePerformance: HomePerformance = buildHomePerformance([]);
  let personalDashboard: PersonalDashboardData | undefined;
  let accountingPeriods: AccountingPeriodView[] = [];
  let economicTrace: EconomicTraceItem[] = [];
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
      { data: operationEntryRows },
      { data: phaseWithdrawalRows },
      { data: walletMovementRows },
      { data: fundingWithdrawalRows },
      { data: ninjaLinkRows },
      { data: ninjaInventoryRows },
      { data: ninjaOperationProbeRows },
      { data: ninjaTransitionRows },
      { data: ninjaBrokerBalanceRows },
      { data: historicalPurchaseRows },
      { data: historicalAccountRows },
      { data: historicalOperationEntryRows },
      { data: historicalPhaseWithdrawalRows },
      { data: historicalControlRows },
      { data: historicalWalletMovementRows },
      { data: historicalFundingWithdrawalRows },
      { data: walletRows },
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
            "id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, allocation_reason, source, created_at, wallet_id, transfer_fee_cents",
          )
          .eq("period_id", selection.period.id)
          .order("control_number"),
        supabase
          .from("daily_control_participants")
          .select("daily_control_id, account_id, role, allocated_result_cents")
          .eq("period_id", selection.period.id),
        supabase
          .from("operation_entries")
          .select(
            "id, daily_control_id, account_id, operated_on, phase, participant_role, destination, magnitude_cents, created_at",
          )
          .eq("period_id", selection.period.id)
          .order("operated_on", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("account_phase_withdrawals")
          .select("account_id, phase, total_withdrawal_cents")
          .eq("period_id", selection.period.id),
        supabase
          .from("wallet_movements")
          .select("id, wallet_id, occurred_on, kind, amount_cents, fee_cents, observation, created_at")
          .eq("period_id", selection.period.id)
          .order("occurred_on", { ascending: false }),
        supabase
          .from("funding_withdrawals")
          .select("id, account_id, approved_on, amount_cents, collected_on, phase, wallet_id, collection_fee_cents, created_at")
          .eq("period_id", selection.period.id)
          .eq("is_active", true)
          .order("approved_on", { ascending: false }),
        supabase
          .from("ninja_account_links")
          .select("account_id, connection_name, external_account_name, closed_at")
          .order("linked_at"),
        supabase.rpc("get_current_user_ninja_inventory"),
        supabase.rpc("get_current_user_ninja_operation_probe_sessions", { target_limit: 100 }),
        supabase.rpc("get_current_user_ninja_change_events", { target_limit: 8 }),
        supabase
          .from("ninja_broker_balance_events")
          .select("id, observed_at, balance_cents, source_accounts, source_event_id")
          .order("observed_at", { ascending: false })
          .limit(30),
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
          .select("id, period_id, wallet_id, occurred_on, kind, amount_cents, fee_cents, observation")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("funding_withdrawals")
          .select("period_id, account_id, phase, amount_cents, collected_on, wallet_id, collection_fee_cents")
          .eq("is_active", true)
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("nodal_wallets")
          .select("id,name")
          .eq("workspace_id", selection.workspace.id)
          .eq("is_active", true)
          .order("created_at"),
      ]);
    walletViews = await Promise.all((walletRows ?? []).map(async (wallet) => {
      const { data } = await supabase.rpc("calculate_nodal_wallet_balance", { target_wallet_id: wallet.id });
      return { balanceInCents: Number(data ?? 0), id: wallet.id, name: wallet.name };
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
        .select("account_id,session_id,allocated_broker_result_cents,role")
        .in("account_id", accountIds).eq("role", "prop")
        .then(({ data }) => data ?? []) : Promise.resolve([]),
    ]) : [[], []];
    const technicalSessionIds = technicalMemberRows.map((row) => row.session_id);
    const technicalSessionRows = privileged && technicalSessionIds.length
      ? (await privileged.from("ninja_operation_probe_sessions")
          .select("id,account_name,result,opened_at")
          .in("id", technicalSessionIds).order("opened_at")).data ?? []
      : [];

    companies = (companyRows ?? []).map((company) => ({
      code: company.code,
      displayName: company.display_name,
      id: company.id,
    }));
    linkedNinjaAccountNames = new Set((ninjaLinkRows ?? []).filter((link) => link.closed_at === null).map((link) => link.external_account_name));
    ninjaNamesByAccountId = new Map((ninjaLinkRows ?? []).map((link) => [link.account_id, link.external_account_name]));
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
    liveNinjaBrokerBalance = buildNinjaLiveBrokerBalance(ninjaInventories);
    if (connectedNinjaAccounts.length > 0 && connectedBrokerAccounts.length === 0) {
      ninjaBrokerSourceNotice =
        "NinjaTrader está conectado, pero no informa ninguna cuenta broker. Los saldos automáticos se reanudarán cuando una cuenta broker vuelva a aparecer en Accounts.";
    }
    ninjaTransitionAlerts = ((ninjaTransitionRows ?? []) as NinjaTransitionRpcRow[])
      .filter((row) => !(row.event_type === "new_account" && row.to_account_name && linkedNinjaAccountNames.has(row.to_account_name)))
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
      (purchaseRows ?? []).map((purchase) => [purchase.account_id, purchase]),
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
    const registerAccountsById = new Map(
      accountOptions.map((account) => [account.id, account]),
    );
    operationEntries = (operationEntryRows ?? []).flatMap((entry) => {
      const account = registerAccountsById.get(entry.account_id);
      if (!account) return [];
      return [
        {
          accountId: account.id,
          accountReference: account.referenceNumber,
          companyId: account.companyId,
          companyName: account.companyName,
          dailyControlId: entry.daily_control_id,
          destination: entry.destination,
          id: entry.id,
          magnitudeInCents: Number(entry.magnitude_cents),
          operatedOn: entry.operated_on,
          participantRole: entry.participant_role,
          phase: entry.phase,
        },
      ];
    });
    phaseWithdrawals = (phaseWithdrawalRows ?? []).flatMap((withdrawal) => {
      if (withdrawal.phase === "Evaluacion") return [];
      return [{
        accountId: withdrawal.account_id,
        phase: withdrawal.phase as AccountPhaseWithdrawal["phase"],
        totalWithdrawalInCents: Number(withdrawal.total_withdrawal_cents),
      }];
    });
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
      const technicalRows = technicalMemberRows
        .filter((member) => member.account_id === account.id)
        .flatMap((member) => {
          const session = sessionById.get(Number(member.session_id));
          if (!session) return [];
          return [{
            broker: Number(member.allocated_broker_result_cents ?? 0),
            date: session.opened_at,
            prop: session.result === null ? null : Math.round(Number(session.result) * 100),
          }];
        })
        .sort((left, right) => left.date.localeCompare(right.date));
      const economicHistory: NonNullable<AccountOverviewAccount["economicHistory"]> = [{
        accumulatedInCents: accumulated, brokerResultInCents: null, concept: "Examen",
        phase: "—", propResultInCents: null, tradeNumber: null,
      }];
      technicalRows.forEach((row, index) => {
        accumulated += row.broker;
        const matchingEntry = (historicalOperationEntryRows ?? []).find((entry) => entry.account_id === account.id && entry.operated_on === row.date.slice(0, 10));
        economicHistory.push({ accumulatedInCents: accumulated, brokerResultInCents: row.broker,
          concept: "Cobertura", phase: matchingEntry?.phase ?? "Evaluacion", propResultInCents: row.prop,
          tradeNumber: index + 1 });
      });
      if (technicalRows.length === 0) {
        let priorCashValue: number | null = null;
        [...(historicalManualAccountBalanceRows ?? [])]
          .filter((row) => row.account_id === account.id)
          .sort((left, right) => left.trade_number - right.trade_number || left.observed_at.localeCompare(right.observed_at))
          .forEach((row) => {
            const cashValue = Number(row.cash_value_cents);
            const propResult = cashValue - (priorCashValue ?? Number(row.initial_balance_cents));
            priorCashValue = cashValue;
            economicHistory.push({ accumulatedInCents: accumulated, brokerResultInCents: null,
              concept: "Cobertura", phase: "Evaluacion", propResultInCents: propResult,
              tradeNumber: Number(row.trade_number) });
          });
      }
      (historicalFundingWithdrawalRows ?? []).filter((row) => row.account_id === account.id && row.collected_on).forEach((row) => {
        const net = Number(row.amount_cents) - Number(row.collection_fee_cents ?? 0);
        accumulated += net;
        economicHistory.push({ accumulatedInCents: accumulated, brokerResultInCents: null, concept: "Payout",
          phase: row.phase ?? "Funded", propResultInCents: null, tradeNumber: null });
      });
      return [{
        canDelete: account.state === "virgin" && !ninjaNamesByAccountId.has(account.id) && !manualBalance
          && !(historicalOperationEntryRows ?? []).some((entry) => entry.account_id === account.id)
          && !(historicalFundingWithdrawalRows ?? []).some((withdrawal) => withdrawal.account_id === account.id)
          && !technicalMemberRows.some((member) => member.account_id === account.id),
        companyId: account.company_id,
        companyName: company.display_name,
        currentCashValueInCents: ninjaBalance?.currentInCents ?? manualBalance?.cashValueInCents ?? null,
        externalName: ninjaNamesByAccountId.get(account.id) ?? null,
        economicHistory,
        fundsOrigin: purchase?.funds_origin ?? null,
        id: account.id,
        initialBalanceInCents: ninjaBalance?.initialInCents ?? manualBalance?.initialBalanceInCents ?? null,
        minimumNetLiquidationInCents: ninjaBalance?.minimumNetLiquidationInCents ?? null,
        periodLabel: formatPeriodLabel(period.periodMonth),
        periodMonth: period.periodMonth,
        priceInCents: purchase ? Number(purchase.price_cents) : null,
        purchaseNumber: purchase?.purchase_number ?? null,
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
    walletMovements = (walletMovementRows ?? []).map((movement) => ({
      amountInCents: Number(movement.amount_cents), id: movement.id,
      kind: movement.kind as WalletMovement["kind"], occurredOn: movement.occurred_on,
      observation: movement.observation,
      feeInCents: Number(movement.fee_cents ?? 0),
      walletId: movement.wallet_id,
    }));
    fundingWithdrawals = (fundingWithdrawalRows ?? []).map((withdrawal) => ({
      accountId: withdrawal.account_id, amountInCents: Number(withdrawal.amount_cents),
      approvedOn: withdrawal.approved_on, collectedOn: withdrawal.collected_on, id: withdrawal.id,
      feeInCents: Number(withdrawal.collection_fee_cents ?? 0),
      phase: withdrawal.phase,
      walletId: withdrawal.wallet_id,
    }));
    economicTrace = [
      ...(dailyControlRows ?? []).flatMap((control): EconomicTraceItem[] =>
        control.kind === "balance_update" || control.movement_cents === null ? [] : [{
          amountInCents: Number(control.movement_cents),
          date: control.operated_on,
          id: `broker-${control.id}`,
          label: control.kind === "deposit" ? "Depósito broker" : "Retiro broker",
          source: control.source === "ninjatrader" ? "Automático" : "Manual",
          status: control.origin_destination,
        }],
      ),
      ...(walletMovementRows ?? []).map((movement): EconomicTraceItem => ({
        amountInCents: Number(movement.amount_cents),
        date: movement.occurred_on,
        id: `wallet-${movement.id}`,
        label: movement.kind === "external_contribution"
          ? "Aporte a billetera"
          : movement.kind === "personal_withdrawal"
            ? "Retiro de billetera"
            : movement.kind === "broker_to_wallet"
              ? "Transferencia broker → billetera"
              : movement.kind === "wallet_to_broker"
                ? "Transferencia billetera → broker"
                : "Cobro pendiente anterior",
        source: "Manual",
      })),
      ...(fundingWithdrawalRows ?? []).flatMap((withdrawal): EconomicTraceItem[] => [{
        amountInCents: Number(withdrawal.amount_cents),
        date: withdrawal.approved_on,
        id: `payout-approved-${withdrawal.id}`,
        label: "Payout aprobado",
        source: "Manual",
        status: withdrawal.collected_on ? "Cobrado" : "Pendiente",
      }, ...(withdrawal.collected_on ? [{
        amountInCents: Number(withdrawal.amount_cents),
        date: withdrawal.collected_on,
        id: `payout-collected-${withdrawal.id}`,
        label: "Payout cobrado",
        source: "Manual" as const,
        status: null,
      }] : [])]),
    ].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
    periodOpening = buildPeriodOpening({
      controls: (historicalControlRows ?? []).map((control) => ({
        balanceAfterInCents: Number(control.balance_after_cents),
        controlNumber: control.control_number,
        kind: control.kind,
        movementInCents: control.movement_cents === null ? null : Number(control.movement_cents),
        operatingResultInCents: control.operating_result_cents === null ? null : Number(control.operating_result_cents),
        originDestination: control.origin_destination,
        periodId: control.period_id,
        transferFeeInCents: Number(control.transfer_fee_cents ?? 0),
      })),
      currentPeriodId: selection.period.id,
      fundingWithdrawals: (historicalFundingWithdrawalRows ?? []).map((withdrawal) => ({
        amountInCents: Number(withdrawal.amount_cents),
        collectedOn: withdrawal.collected_on,
        feeInCents: Number(withdrawal.collection_fee_cents ?? 0),
        periodId: withdrawal.period_id,
      })),
      periodIdsInOrder: [...selection.workspace.periods]
        .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))
        .map((period) => period.id),
      purchases: (historicalPurchaseRows ?? []).map((purchase) => ({
        fundsOrigin: purchase.funds_origin === "Saldo generado" ? "Saldo generado" : "Aporte trader",
        periodId: purchase.period_id,
        priceInCents: Number(purchase.price_cents),
      })),
      walletMovements: (historicalWalletMovementRows ?? []).map((movement) => ({
        amountInCents: Number(movement.amount_cents),
        id: movement.id,
        kind: movement.kind,
        feeInCents: Number(movement.fee_cents ?? 0),
        observation: movement.observation,
        occurredOn: movement.occurred_on,
        periodId: movement.period_id,
      })),
    });
    operationalSummary = buildOperationalSummary({
      accounts: accountOptions.map((account) => ({
        fundsOrigin: account.fundsOrigin === "Saldo generado" ? "Saldo generado" : "Aporte trader",
        id: account.id, priceInCents: account.priceInCents ?? 0, state: account.state,
        stateOrigin: account.stateOrigin,
      })),
      controls: (dailyControlRows ?? []).map((control) => ({
        balanceAfterInCents: Number(control.balance_after_cents), controlNumber: control.control_number,
        kind: control.kind, movementInCents: control.movement_cents === null ? null : Number(control.movement_cents),
        operatingResultInCents: control.operating_result_cents === null ? null : Number(control.operating_result_cents),
        originDestination: control.origin_destination,
        transferFeeInCents: Number(control.transfer_fee_cents ?? 0),
      })),
      entries: operationEntries, fundingWithdrawals, opening: periodOpening, phaseWithdrawals, walletMovements,
    });
    operationalSummary = applyIndividualCommission(operationalSummary, await loadIndividualCommission(user.id, selection.period.periodMonth));
    personalDashboard = await loadPersonalDeskDashboard(selection.period.periodMonth) ?? {
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
    const loadedAccountingPeriods = await loadPeriodSummaries(
      supabase,
      selection.workspace.periods
        .filter((workspacePeriod) => workspacePeriod.periodMonth <= selection.period!.periodMonth)
        .map((workspacePeriod) => workspacePeriod.id),
    );
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
    homePerformance = buildHomePerformance((dailyControlRows ?? []).map((control) => ({
      operatedOn: control.operated_on,
      resultInCents: control.operating_result_cents === null
        ? null
        : Number(control.operating_result_cents),
    })));
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
  }

  return (
    <AppWorkspace
      administrationScope={administrationScope}
      authorized={allowed}
      avatarUrl={typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null}
      initialView={singleValue(purchaseResult) || singleValue(resetResult) ? "accounts" : "home"}
      userLabel={nodalUser?.display_name || nodalUser?.email || user.email || "Alumno"}
      username={typeof user.user_metadata?.username === "string" ? user.user_metadata.username : undefined}
    >
      <NinjaConnectorMonitor inventoryRevision={ninjaInventoryRevision} online={connectorOnline} />
      {!connectorOnline ? (
        <div className="notice connector-offline-notice" role="status">
          <span>Conector sin señal. Estás viendo los últimos datos guardados.</span>
          <details className="connector-recovery">
            <summary>Volver a vincular</summary>
            <div className="connector-recovery-panel">
              <a className="connector-recovery-download" download href="/downloads/NODAL-Ninja-Connector.zip">
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
            {nodalUser?.access_role === "admin" && (
              <Link href="/app/admin">Administración</Link>
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
          liveBrokerBalance={liveNinjaBrokerBalance}
          ninjaOnline={connectorOnline}
          performance={homePerformance}
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
            return <DetectedNinjaAccounts accounts={accounts} companyIds={companyIds} connectorId={inventory.connector_id} key={inventory.connector_id} linkedAccountNames={linkedNinjaAccountNames} mode={selection.workspace.modality} online={connectorOnline} period={selection.period!.periodMonth} periodId={selection.period!.id} wallets={walletViews} />;
          })}

          <AccountsOverview
            accounts={accountHistory}
            entries={operationEntryHistory}
            withdrawals={phaseWithdrawalHistory}
          />

          <details className="accounting-exception">
            <summary>Registrar manualmente</summary>
            {selection.period.periodMonth === currentMonthInBuenosAires() ? (
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
              .filter((account) => !account.externalName)
              .map((account) => ({
                companyName: account.companyName,
                id: account.id,
                label: `Cuenta ${account.referenceNumber}`,
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
          <details className="demo-operation-disclosure real-account-results">
            <summary>
              <span>Resultados por cuenta</span>
              <strong>{accountOptions.length}</strong>
              <i aria-hidden="true" />
            </summary>
            <OperationRegister
              accounts={accountOptions}
              embedded
              entries={operationEntries}
              periodId={selection.period.id}
              withdrawals={phaseWithdrawals}
            />
          </details>
        </section>
      )}

      {allowed && selection?.period && (
        <section className="accounting-view" id="contabilidad" aria-labelledby="accounting-title">
          <div className="workspace-section-heading">
            <h2 id="accounting-title">Contabilidad</h2>
          </div>
          <ProgressSummary
            accounts={accountOptions.map((account) => ({ id: account.id, label: `${account.companyName} · ${account.externalName ?? `Cuenta ${account.referenceNumber}`}` }))}
            economicTrace={economicTrace}
            embedded
            liveBrokerBalance={liveNinjaBrokerBalance}
            ninjaOnline={connectorOnline}
            periodId={selection.period.id}
            periodLabel={formatPeriodLabel(selection.period.periodMonth)}
            periods={accountingPeriods}
            summary={operationalSummary}
            wallets={walletViews}
          />
        </section>
      )}

      {allowed && !selection && (
        <p className="notice">
          Tu acceso está habilitado, pero todavía no existe un período operativo.
        </p>
      )}

    </AppWorkspace>
  );
}
