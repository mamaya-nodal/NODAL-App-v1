import { applyIndividualCommission } from '@/modules/summary/domain/individual-commission';
import { loadIndividualCommission } from '@/modules/summary/server/individual-commission';
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";
import { classifyNinjaAccount } from "@/modules/ninja/domain/account-classification";
import type { NinjaAccountSnapshot } from "@/modules/ninja/domain/ingestion-payload";
import {
  buildPeriodActivity,
  type PeriodActivityItem,
  type PeriodActivityRow,
} from "@/modules/activity/domain/period-activity";
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
import {
  formatPeriodLabel,
  resolveWorkspaceSelection,
  type WorkspaceOption,
} from "@/modules/workspace/domain/selection";

import { createPurchase } from "./purchase-actions";
import { DevelopmentPeriodReset } from "./development-period-reset";
import { DetectedNinjaAccounts } from "./detected-ninja-accounts";
import { NinjaConnectorGate } from "./ninja-connector-gate";
import { NinjaConnectorMonitor } from "./ninja-connector-monitor";
import { NinjaTransitionAlerts, type NinjaTransitionAlert } from "./ninja-transition-alerts";
import type { NinjaConnectorStatus } from "./ninja-connector-panel";
import { ActivityHistory } from "./activity-history";
import {
  DailyControlPreview,
  type NinjaBrokerBalanceEvent,
  type PersistedDailyControl,
} from "./daily-control-preview";
import { HomeOverview } from "./home-overview";
import {
  OperationRegister,
  type RegisterAccount,
} from "./operation-register";
import { ProgressSummary } from "./progress-summary";
import { ThemeToggle } from "./theme-toggle";
import { AppWorkspace } from "./app-workspace";

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

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    style: "currency",
  }).format(cents / 100);
}

const purchaseMessages: Record<string, string> = {
  already_created: "Esa cuenta de Ninja ya estaba vinculada. No se creó una compra duplicada.",
  created: "Compra confirmada. La cuenta quedó creada como Cuenta virgen.",
  invalid_data: "Revisá la empresa, el precio y el origen de fondos.",
  not_created: "La compra no pudo confirmarse. No se guardó ningún dato.",
  period_not_current:
    "Ese período no admite una compra con fecha automática. La carga histórica sigue pendiente de definición.",
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

type ActivityRpcRow = {
  account_reference: number | null;
  action: PeriodActivityRow["action"];
  audit_event_id: number;
  balance_after_cents: number | string | null;
  company_name: string | null;
  control_kind: PeriodActivityRow["controlKind"];
  control_number: number | null;
  funds_origin: string | null;
  occurred_at: string;
  operated_on: string | null;
  phase: string | null;
  primary_amount_cents: number | string | null;
  purchase_number: number | null;
  reason: string | null;
};

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
  const { mode, period, purchase_result: purchaseResult, reset_result: resetResult, connector_result: connectorResult, transition_result: transitionResult } = await searchParams;
  let workspaceOptions: WorkspaceOption[] = [];
  let companies: Array<{ code: string; displayName: string; id: string }> = [];
  let linkedNinjaAccountNames = new Set<string>();
  let ninjaNamesByAccountId = new Map<string, string>();
  let ninjaInventories: NinjaInventoryRpcRow[] = [];
  let ninjaConnector: NinjaConnectorStatus | null = null;
  let ninjaTransitionAlerts: NinjaTransitionAlert[] = [];
  let incomingNinjaBalance: NinjaBrokerBalanceEvent | null = null;
  let ninjaBrokerSourceNotice: string | null = null;

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
        connector={ninjaConnector}
        isAdmin={nodalUser?.access_role === "admin"}
        message={singleValue(connectorResult) === "revoked" ? connectorMessages.revoked : undefined}
      />
    );
  }

  const selection = resolveWorkspaceSelection(
    workspaceOptions,
    singleValue(mode),
    singleValue(period),
  );
  let purchases: PurchaseView[] = [];
  let accountOptions: AccountView[] = [];
  let dailyControls: PersistedDailyControl[] = [];
  let operationEntries: OperationRegisterEntry[] = [];
  let phaseWithdrawals: AccountPhaseWithdrawal[] = [];
  let walletMovements: WalletMovement[] = [];
  let fundingWithdrawals: FundingWithdrawal[] = [];
  let periodActivity: PeriodActivityItem[] = [];
  let operationalSummary: OperationalSummary = buildOperationalSummary({
    accounts: [], controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
  });
  let capitalHistory: CapitalHistoryPoint[] = [];
  let homePerformance: HomePerformance = buildHomePerformance([]);

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
      { data: activityRows },
      { data: ninjaLinkRows },
      { data: ninjaInventoryRows },
      { data: ninjaTransitionRows },
      { data: ninjaBrokerBalanceRows },
      { data: historicalPurchaseRows },
      { data: historicalControlRows },
      { data: historicalWalletMovementRows },
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
            "id, account_id, purchase_number, purchased_on, price_cents, funds_origin",
          )
          .eq("period_id", selection.period.id)
          .order("purchase_number", { ascending: false }),
        supabase
          .from("daily_controls")
          .select(
            "id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, allocation_reason",
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
          .select("id, occurred_on, kind, amount_cents, observation")
          .eq("period_id", selection.period.id)
          .order("occurred_on", { ascending: false }),
        supabase
          .from("funding_withdrawals")
          .select("id, account_id, approved_on, amount_cents, collected_on")
          .eq("period_id", selection.period.id)
          .eq("is_active", true)
          .order("approved_on", { ascending: false }),
        supabase.rpc("list_nodal_period_activity", {
          target_period_id: selection.period.id,
        }),
        supabase
          .from("ninja_account_links")
          .select("account_id, external_account_name")
          .is("closed_at", null),
        supabase.rpc("get_current_user_ninja_inventory"),
        supabase.rpc("get_current_user_ninja_change_events", { target_limit: 8 }),
        supabase.rpc("get_current_user_pending_ninja_broker_balance"),
        supabase
          .from("purchases")
          .select("period_id, price_cents, funds_origin")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("daily_controls")
          .select("period_id, kind, movement_cents, origin_destination")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
        supabase
          .from("wallet_movements")
          .select("period_id, kind, amount_cents")
          .in("period_id", selection.workspace.periods.map((workspacePeriod) => workspacePeriod.id)),
      ]);

    companies = (companyRows ?? []).map((company) => ({
      code: company.code,
      displayName: company.display_name,
      id: company.id,
    }));
    linkedNinjaAccountNames = new Set((ninjaLinkRows ?? []).map((link) => link.external_account_name));
    ninjaNamesByAccountId = new Map((ninjaLinkRows ?? []).map((link) => [link.account_id, link.external_account_name]));
    ninjaInventories = (ninjaInventoryRows ?? []) as NinjaInventoryRpcRow[];
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
    const brokerBalanceRow = (ninjaBrokerBalanceRows?.[0] ?? null) as
      | NinjaBrokerBalanceRpcRow
      | null;
    incomingNinjaBalance = brokerBalanceRow
      ? {
          balanceInCents: Number(brokerBalanceRow.balance_cents),
          id: brokerBalanceRow.id,
          observedAt: brokerBalanceRow.observed_at,
          sourceAccounts: brokerBalanceRow.source_accounts,
        }
      : null;
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
    walletMovements = (walletMovementRows ?? []).map((movement) => ({
      amountInCents: Number(movement.amount_cents), id: movement.id,
      kind: movement.kind as WalletMovement["kind"], occurredOn: movement.occurred_on,
      observation: movement.observation,
    }));
    fundingWithdrawals = (fundingWithdrawalRows ?? []).map((withdrawal) => ({
      accountId: withdrawal.account_id, amountInCents: Number(withdrawal.amount_cents),
      approvedOn: withdrawal.approved_on, collectedOn: withdrawal.collected_on, id: withdrawal.id,
    }));
    periodActivity = buildPeriodActivity(
      ((activityRows ?? []) as ActivityRpcRow[]).map((row) => ({
        accountReference: row.account_reference,
        action: row.action,
        auditEventId: row.audit_event_id,
        balanceAfterInCents:
          row.balance_after_cents === null
            ? null
            : Number(row.balance_after_cents),
        companyName: row.company_name,
        controlKind: row.control_kind,
        controlNumber: row.control_number,
        fundsOrigin: row.funds_origin,
        occurredAt: row.occurred_at,
        operatedOn: row.operated_on,
        phase: row.phase,
        primaryAmountInCents:
          row.primary_amount_cents === null
            ? null
            : Number(row.primary_amount_cents),
        purchaseNumber: row.purchase_number,
        reason: row.reason,
      })),
    );
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
      })),
      entries: operationEntries, fundingWithdrawals, phaseWithdrawals, walletMovements,
    });
    operationalSummary = applyIndividualCommission(operationalSummary, await loadIndividualCommission(user.id, selection.period.periodMonth));
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
      authorized={allowed}
      avatarUrl={typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null}
      initialView={singleValue(purchaseResult) || singleValue(resetResult) ? "accounts" : "home"}
      isAdmin={nodalUser?.access_role === "admin"}
      userLabel={nodalUser?.display_name || nodalUser?.email || user.email || "Alumno"}
      username={typeof user.user_metadata?.username === "string" ? user.user_metadata.username : undefined}
    >
      <NinjaConnectorMonitor online={connectorOnline} />
      {!connectorOnline ? (
        <p className="notice connector-offline-notice" role="status">
          Conector sin señal. Estás viendo los últimos datos guardados.
        </p>
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

      {allowed && selection && (
        <section className="context-panel" aria-labelledby="context-title">
          <div className="context-heading">
            <div>
              <p className="status">CONTEXTO DE TRABAJO</p>
              <h2 id="context-title">Modalidad y período</h2>
            </div>
            <p className="context-current" aria-live="polite">
              {selection.workspace.modality === "real" ? "Real" : "Práctica"}
              {selection.period
                ? ` · ${formatPeriodLabel(selection.period.periodMonth)}`
                : " · Sin período disponible"}
            </p>
          </div>

          <nav className="mode-tabs" aria-label="Seleccionar modalidad">
            {workspaceOptions.map((workspace) => {
              const latestPeriod = [...workspace.periods].sort((left, right) =>
                right.periodMonth.localeCompare(left.periodMonth),
              )[0];
              const selected = workspace.id === selection.workspace.id;
              const params = new URLSearchParams({ mode: workspace.modality });
              if (latestPeriod) params.set("period", latestPeriod.periodMonth);

              return (
                <a
                  aria-current={selected ? "page" : undefined}
                  className={`mode-tab${selected ? " selected" : ""}`}
                  href={`/app?${params.toString()}`}
                  key={workspace.id}
                >
                  {workspace.modality === "real" ? "Real" : "Práctica"}
                </a>
              );
            })}
          </nav>

          {selection.workspace.periods.length > 0 ? (
            <form className="period-form" action="/app" method="get">
              <input
                name="mode"
                type="hidden"
                value={selection.workspace.modality}
              />
              <label htmlFor="period">Período mensual</label>
              <div className="period-controls">
                <select
                  defaultValue={selection.period?.periodMonth}
                  id="period"
                  name="period"
                >
                  {selection.workspace.periods.map((workspacePeriod) => (
                    <option
                      key={workspacePeriod.id}
                      value={workspacePeriod.periodMonth}
                    >
                      {formatPeriodLabel(workspacePeriod.periodMonth)}
                    </option>
                  ))}
                </select>
                <button className="secondary-action inline-action" type="submit">
                  Cambiar período
                </button>
              </div>
            </form>
          ) : (
            <p className="notice">
              Este espacio todavía no tiene un período de desarrollo disponible.
            </p>
          )}

          <p className="context-note">
            Todos los registros futuros quedarán asociados a esta modalidad y a
            este período. Real y Práctica nunca se mezclarán.
          </p>
        </section>
      )}

      {allowed && selection?.period && (
        <HomeOverview
          capitalHistory={capitalHistory}
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
            return <DetectedNinjaAccounts accounts={accounts} companyIds={companyIds} connectorId={inventory.connector_id} key={inventory.connector_id} linkedAccountNames={linkedNinjaAccountNames} mode={selection.workspace.modality} period={selection.period!.periodMonth} periodId={selection.period!.id} />;
          })}

          <div className="purchase-list-heading">
            <h3>Registradas</h3>
            <strong>{formatMoney(purchases.reduce((total, purchase) => total + purchase.priceCents, 0))}</strong>
          </div>

          <div className="purchase-list" aria-label="Compras registradas">
            {purchases.length === 0 ? (
              <p className="empty-state">Todavía no hay cuentas registradas.</p>
            ) : (
              purchases.map((purchase) => (
                <article className="purchase-row" key={purchase.id}>
                  <div>
                    <p className="purchase-reference">
                      {purchase.companyCode} · {purchase.externalName ?? `Cuenta ${purchase.referenceNumber}`}
                    </p>
                    <p className="purchase-meta">
                      #{purchase.purchaseNumber} · {purchase.purchasedOn} · {purchase.fundsOrigin}
                    </p>
                  </div>
                  <div className="purchase-values">
                    <strong>{formatMoney(purchase.priceCents)}</strong>
                    <span className={`purchase-state purchase-state-${purchase.state}`}>
                      {purchase.state === "virgin"
                        ? "Cuenta virgen"
                        : purchase.state === "live"
                          ? "Cuenta viva"
                          : "Cuenta cerrada"}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>

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

              <div className="form-field">
                <label htmlFor="funds_origin">Origen de fondos</label>
                <select id="funds_origin" name="funds_origin" required defaultValue="Aporte trader">
                  <option value="Aporte trader">Aporte trader</option>
                  <option value="Saldo generado">Saldo generado</option>
                </select>
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
            key={incomingNinjaBalance?.id ?? "no-ninja-balance"}
            accounts={accountOptions}
            companies={companies.map((company) => ({
              id: company.id,
              name: company.displayName,
            }))}
            embedded
            initialControls={dailyControls}
            incomingNinjaBalance={incomingNinjaBalance}
            ninjaBrokerSourceNotice={ninjaBrokerSourceNotice}
            periodId={selection.period.id}
          />
          <OperationRegister
            accounts={accountOptions}
            embedded
            entries={operationEntries}
            periodId={selection.period.id}
            withdrawals={phaseWithdrawals}
          />
        </section>
      )}

      {allowed && selection?.period && (
        <section className="accounting-view" id="contabilidad" aria-labelledby="accounting-title">
          <div className="workspace-section-heading">
            <h2 id="accounting-title">Contabilidad</h2>
          </div>
          <ProgressSummary
            accounts={accountOptions.map((account) => ({ id: account.id, label: `${account.companyName} · ${account.externalName ?? `Cuenta ${account.referenceNumber}`}` }))}
            embedded
            periodId={selection.period.id}
            summary={operationalSummary}
          />
          <details className="accounting-history">
            <summary>
              <span>Historial</span>
              <strong>{periodActivity.length}</strong>
            </summary>
            <ActivityHistory embedded items={periodActivity} />
          </details>
        </section>
      )}

      {allowed && !selection && (
        <p className="notice">
          Tu acceso está habilitado, pero los espacios Real y Práctica todavía
          no fueron preparados.
        </p>
      )}

    </AppWorkspace>
  );
}
