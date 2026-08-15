import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";
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
  buildProgressSummary,
  type ProgressSummary as ProgressSummaryData,
  type SummaryAccountState,
} from "@/modules/summary/domain/progress-summary";
import {
  buildOperationalSummary,
  type OperationalSummary,
  type FundingWithdrawal,
  type WalletMovement,
} from "@/modules/summary/domain/operational-summary";
import {
  formatPeriodLabel,
  resolveWorkspaceSelection,
  type WorkspaceOption,
} from "@/modules/workspace/domain/selection";

import { createPurchase } from "./purchase-actions";
import { ActivityHistory } from "./activity-history";
import {
  DailyControlPreview,
  type PersistedDailyControl,
} from "./daily-control-preview";
import { HomeOverview } from "./home-overview";
import {
  OperationRegister,
  type RegisterAccount,
} from "./operation-register";
import { ProgressSummary } from "./progress-summary";

type PrivateAppPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    period?: string | string[];
    purchase_result?: string | string[];
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
  created: "Compra confirmada. La cuenta quedó creada como Cuenta virgen.",
  invalid_data: "Revisá la empresa, el precio y el origen de fondos.",
  not_created: "La compra no pudo confirmarse. No se guardó ningún dato.",
  period_not_current:
    "Ese período no admite una compra con fecha automática. La carga histórica sigue pendiente de definición.",
};

type PurchaseView = {
  companyCode: string;
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
    .select("id, email, access_state, access_role")
    .eq("id", user.id)
    .maybeSingle();

  const decision = decideAccess(
    user.id,
    nodalUser
      ? { id: nodalUser.id, accessState: nodalUser.access_state }
      : null,
  );
  const allowed = decision === "allowed";
  const { mode, period, purchase_result: purchaseResult } = await searchParams;
  let workspaceOptions: WorkspaceOption[] = [];
  let companies: Array<{ code: string; displayName: string; id: string }> = [];

  if (allowed) {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, modality, periods(id, period_month)")
      .order("modality");

    workspaceOptions = (workspaces ?? []).map((workspace) => ({
      id: workspace.id,
      modality: workspace.modality,
      periods: workspace.periods.map((workspacePeriod) => ({
        id: workspacePeriod.id,
        periodMonth: workspacePeriod.period_month,
      })),
    }));
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
  let progressSummary: ProgressSummaryData = buildProgressSummary({
    accountStates: [],
    controls: [],
    operationEntryCount: 0,
    purchaseCostsInCents: [],
  });
  let operationalSummary: OperationalSummary = buildOperationalSummary({
    accounts: [], controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
  });

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
      ]);

    companies = (companyRows ?? []).map((company) => ({
      code: company.code,
      displayName: company.display_name,
      id: company.id,
    }));
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
    progressSummary = buildProgressSummary({
      accountStates: (accountRows ?? []).map(
        (account) => account.state as SummaryAccountState,
      ),
      controls: (dailyControlRows ?? []).map((control) => ({
        balanceInCents: Number(control.balance_after_cents),
        kind: control.kind,
        movementInCents:
          control.movement_cents === null ? null : Number(control.movement_cents),
        operatedOn: control.operated_on,
        operatingResultInCents:
          control.operating_result_cents === null
            ? null
            : Number(control.operating_result_cents),
      })),
      operationEntryCount: operationEntries.length,
      purchaseCostsInCents: (purchaseRows ?? []).map((purchase) =>
        Number(purchase.price_cents),
      ),
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
      })),
      entries: operationEntries, fundingWithdrawals, phaseWithdrawals, walletMovements,
    });
  }

  return (
    <main className="shell narrow-shell">
      <header className="app-header" aria-labelledby="private-title">
        <div className="app-brand-row">
          <a className="app-brand" href="#inicio" aria-label="Ir al inicio">
            NODAL <span>APP</span>
          </a>
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
            <a href="#compras">Compras</a>
            <a href="#control-diario">Control Diario</a>
            <a href="#registro">Registro</a>
            <a href="#resumen">Resumen</a>
            <a href="#actividad">Actividad</a>
            {nodalUser?.access_role === "admin" && (
              <Link href="/app/admin">Administración</Link>
            )}
            <form action="/auth/logout" className="logout-form" method="post">
              <button type="submit">Cerrar sesión</button>
            </form>
          </nav>
        )}

        {!allowed && (
          <p className="notice">
            Este bloqueo es intencional: iniciar sesion con Google no concede
            acceso automatico a la informacion de NODAL.
          </p>
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
          modalityLabel={selection.workspace.modality === "real" ? "Real" : "Práctica"}
          periodLabel={formatPeriodLabel(selection.period.periodMonth)}
          summary={progressSummary}
        />
      )}

      {allowed && selection?.period && (
        <section className="purchase-panel" id="compras" aria-labelledby="purchase-title">
          <div className="purchase-heading">
            <div>
              <p className="status">COMPRAS DEL PERÍODO</p>
              <h2 id="purchase-title">Nueva compra de cuenta</h2>
            </div>
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
                <select id="funds_origin" name="funds_origin" required defaultValue="">
                  <option disabled value="">
                    Elegí el origen
                  </option>
                  <option value="Aporte trader">Aporte trader</option>
                  <option value="Saldo generado">Saldo generado</option>
                </select>
              </div>

              <div className="automatic-fields">
                <p>
                  <strong>Automático al confirmar:</strong> fecha de hoy, número
                  general, referencia propia de la empresa y estado Cuenta virgen.
                </p>
              </div>

              <button className="primary-action" type="submit">
                Confirmar compra
              </button>
            </form>
          ) : (
            <p className="notice">
              Este período es de consulta. La carga de una compra anterior se
              habilitará cuando Contabilidad defina su tratamiento exacto.
            </p>
          )}

          <div className="purchase-list" aria-label="Compras registradas">
            {purchases.length === 0 ? (
              <p className="empty-state">Todavía no hay compras en este período.</p>
            ) : (
              purchases.map((purchase) => (
                <article className="purchase-row" key={purchase.id}>
                  <div>
                    <p className="purchase-reference">
                      {purchase.companyCode} · Cuenta {purchase.referenceNumber}
                    </p>
                    <p className="purchase-meta">
                      Compra {purchase.purchaseNumber} · {purchase.purchasedOn} ·{" "}
                      {purchase.fundsOrigin}
                    </p>
                  </div>
                  <div className="purchase-values">
                    <strong>{formatMoney(purchase.priceCents)}</strong>
                    <span>
                      {purchase.state === "virgin" ? "Cuenta virgen" : purchase.state}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {allowed && selection?.period && (
        <DailyControlPreview
          accounts={accountOptions}
          companies={companies.map((company) => ({
            id: company.id,
            name: company.displayName,
          }))}
          initialControls={dailyControls}
          periodId={selection.period.id}
        />
      )}

      {allowed && selection?.period && (
        <OperationRegister
          accounts={accountOptions}
          entries={operationEntries}
          periodId={selection.period.id}
          withdrawals={phaseWithdrawals}
        />
      )}

      {allowed && selection?.period && (
        <ProgressSummary
          accounts={accountOptions.map((account) => ({ id: account.id, label: `${account.companyName} · Cuenta ${account.referenceNumber}` }))}
          periodId={selection.period.id}
          summary={operationalSummary}
        />
      )}

      {allowed && selection?.period && (
        <ActivityHistory items={periodActivity} />
      )}

      {allowed && !selection && (
        <p className="notice">
          Tu acceso está habilitado, pero los espacios Real y Práctica todavía
          no fueron preparados.
        </p>
      )}

    </main>
  );
}
