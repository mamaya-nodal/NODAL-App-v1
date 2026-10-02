import type { SupabaseClient } from "@supabase/supabase-js";

import { latestTerms, type DeskTerms, type UserTerms } from "@/modules/admin/domain/desks";
import { splitDeskMemberBilling, type PeriodCloseReportSnapshot } from "@/modules/accounting/domain/period-close-report";
import { calculateAccountResult, type AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

type PeriodRow = {
  closed_at: string | null;
  id: string;
  operational_start_on: string;
  period_month: string;
  scheduled_close_at: string;
  workspace_id: string;
};
type WorkspaceRow = { id: string; modality: "practice" | "real"; owner_user_id: string };
type UserRow = { display_name: string | null; email: string; id: string };
type ClosureRow = {
  closed_at: string;
  closure_status: string;
  commission_cents: number | string;
  id: string;
  period_id: string;
  realized_gain_cents: number | string;
  summary_data: Record<string, unknown>;
  trader_result_cents: number | string;
  version: number;
};
type AccountRow = {
  company_id: string;
  id: string;
  reference_number: number;
  state: "closed" | "live" | "virgin";
  state_origin: "automatic" | "manual_closed" | "manual_live";
};
type EntryRow = {
  account_id: string;
  daily_control_id: string;
  destination: OperationRegisterEntry["destination"];
  id: string;
  magnitude_cents: number | string;
  operated_on: string;
  participant_role: OperationRegisterEntry["participantRole"];
  phase: OperationRegisterEntry["phase"];
};
type BatchRow = {
  accounting_company_id: string | null;
  accounting_phase: string | null;
  broker_session_id: number;
  id: string;
  opened_at: string;
  operated_on: string | null;
  settled_at: string | null;
};
type MemberRow = { account_id: string | null; batch_id: string; role: string; session_id: number };
type ManualMemberRow = { account_id: string; batch_id: string };
type SessionRow = {
  account_name: string;
  excluded_at: string | null;
  execution_count: number;
  id: number;
  instruments: unknown;
  opened_at: string;
  settled_at: string | null;
};
type AssignmentRow = {
  account_id: string;
  assigned_at: string;
  identity_id: string;
  unassigned_at: string | null;
};
type IdentityRow = { first_name: string; id: string; last_name: string };

function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function instruments(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function finalAccountResult(
  account: AccountRow,
  purchaseInCents: number,
  entries: readonly EntryRow[],
  withdrawals: readonly { account_id: string; phase: string; total_withdrawal_cents: number | string }[],
): number {
  const accountEntries: OperationRegisterEntry[] = entries
    .filter((entry) => entry.account_id === account.id)
    .map((entry) => ({
      accountId: account.id,
      accountReference: account.reference_number,
      companyId: account.company_id,
      companyName: "",
      dailyControlId: entry.daily_control_id,
      destination: entry.destination,
      id: entry.id,
      magnitudeInCents: asNumber(entry.magnitude_cents),
      operatedOn: entry.operated_on,
      participantRole: entry.participant_role,
      phase: entry.phase,
    }));
  const accountWithdrawals: AccountPhaseWithdrawal[] = withdrawals
    .filter((withdrawal) => withdrawal.account_id === account.id && withdrawal.phase !== "Evaluacion")
    .map((withdrawal) => ({
      accountId: account.id,
      phase: withdrawal.phase as AccountPhaseWithdrawal["phase"],
      totalWithdrawalInCents: asNumber(withdrawal.total_withdrawal_cents),
    }));
  return [...calculateAccountResult(
    accountEntries,
    accountWithdrawals,
    account.state_origin,
    purchaseInCents,
  ).phaseResults].reverse().find((phase) => phase.totalGainInCents !== 0)?.totalGainInCents ?? 0;
}

function phaseDay(entries: readonly EntryRow[], accountIds: readonly string[], phase: string | null, operatedOn: string): string {
  if (!phase) return "Sin fase";
  const days = [...new Set(entries
    .filter((entry) => accountIds.includes(entry.account_id) && entry.phase === phase && entry.operated_on <= operatedOn)
    .map((entry) => entry.operated_on))].sort();
  const label = phase === "Evaluacion" ? "Evaluación" : phase;
  return `${label} D${Math.max(1, days.length)}`;
}

async function loadDeskSnapshot(
  db: SupabaseClient,
  ownerUserId: string,
  month: string,
  modality: "practice" | "real",
): Promise<PeriodCloseReportSnapshot["desk"]> {
  const [desksResult, deskTermsResult, userTermsResult, usersResult, workspacesResult] = await Promise.all([
    db.from("nodal_desks").select("id,name,parent_id").order("id"),
    db.from("nodal_desk_terms").select("desk_id,effective_month,manager_id,nodal_bps,active").lte("effective_month", month).order("effective_month"),
    db.from("nodal_user_terms").select("user_id,effective_month,desk_id,level,state,commission_bps,bonus_enabled").lte("effective_month", month).order("effective_month"),
    db.from("nodal_users").select("id,email,display_name").order("id"),
    db.from("workspaces").select("id,owner_user_id,modality").eq("modality", modality).order("id"),
  ]);
  const error = desksResult.error ?? deskTermsResult.error ?? userTermsResult.error ?? usersResult.error ?? workspacesResult.error;
  if (error) throw new Error("No se pudo congelar la composición de la mesa.");
  const deskTerms = latestTerms((deskTermsResult.data ?? []) as DeskTerms[], month, (row) => row.desk_id);
  const managed = deskTerms.find((row) => row.active && row.manager_id === ownerUserId);
  if (!managed) return null;
  const desk = (desksResult.data ?? []).find((row) => row.id === managed.desk_id);
  if (!desk) return null;
  const userTerms = latestTerms((userTermsResult.data ?? []) as UserTerms[], month, (row) => row.user_id)
    .filter((row) => row.desk_id === managed.desk_id && row.state === "active");
  if (userTerms.length === 0) return { name: desk.name, rows: [] };
  const workspaceByOwner = new Map((workspacesResult.data ?? []).map((workspace) => [workspace.owner_user_id, workspace.id]));
  const workspaceIds = userTerms.flatMap((row) => workspaceByOwner.get(row.user_id) ? [workspaceByOwner.get(row.user_id)!] : []);
  if (workspaceIds.length === 0) return { name: desk.name, rows: [] };
  const { data: periods, error: periodsError } = await db
    .from("periods")
    .select("id,workspace_id")
    .in("workspace_id", workspaceIds)
    .eq("period_month", month);
  if (periodsError) throw new Error("No se pudieron congelar los períodos de la mesa.");
  const periodIds = (periods ?? []).map((period) => period.id);
  if (periodIds.length === 0) return { name: desk.name, rows: [] };
  const [closuresResult, accountsResult] = await Promise.all([
    db.from("period_closure_versions").select("period_id,version,realized_gain_cents").in("period_id", periodIds).order("version", { ascending: false }),
    db.from("accounts").select("period_id,state").in("period_id", periodIds),
  ]);
  if (closuresResult.error ?? accountsResult.error) throw new Error("No se pudo consolidar la mesa.");
  const latestClosure = new Map<string, { realized_gain_cents: number | string }>();
  for (const closure of closuresResult.data ?? []) if (!latestClosure.has(closure.period_id)) latestClosure.set(closure.period_id, closure);
  const periodByWorkspace = new Map((periods ?? []).map((period) => [period.workspace_id, period.id]));
  const userById = new Map((usersResult.data ?? []).map((user) => [user.id, user]));
  return {
    name: desk.name,
    rows: userTerms.flatMap((terms) => {
      const workspaceId = workspaceByOwner.get(terms.user_id);
      const periodId = workspaceId ? periodByWorkspace.get(workspaceId) : null;
      const closure = periodId ? latestClosure.get(periodId) : null;
      if (!periodId || !closure) return [];
      const billedInCents = Math.max(0, asNumber(closure.realized_gain_cents));
      const split = splitDeskMemberBilling({
        billedInCents,
        generatedCommissionBps: terms.commission_bps,
        nodalShareOfCommissionBps: managed.nodal_bps,
      });
      return [{
        accountsClosed: (accountsResult.data ?? []).filter((account) => account.period_id === periodId && account.state === "closed").length,
        ...split,
        billedInCents,
        memberName: userById.get(terms.user_id)?.display_name || userById.get(terms.user_id)?.email || "Integrante sin nombre",
      }];
    }).sort((left, right) => left.memberName.localeCompare(right.memberName, "es")),
  };
}

export async function loadPeriodCloseReportSnapshot(
  db: SupabaseClient,
  periodId: string,
): Promise<PeriodCloseReportSnapshot> {
  const { data: periodData, error: periodError } = await db
    .from("periods")
    .select("id,workspace_id,period_month,operational_start_on,scheduled_close_at,closed_at")
    .eq("id", periodId)
    .single();
  if (periodError || !periodData) throw new Error("No se encontró el período del informe.");
  const period = periodData as PeriodRow;
  const { data: workspaceData, error: workspaceError } = await db
    .from("workspaces").select("id,owner_user_id,modality").eq("id", period.workspace_id).single();
  if (workspaceError || !workspaceData) throw new Error("No se encontró el espacio del informe.");
  const workspace = workspaceData as WorkspaceRow;
  const [{ data: ownerData, error: ownerError }, { data: closureData, error: closureError }] = await Promise.all([
    db.from("nodal_users").select("id,email,display_name").eq("id", workspace.owner_user_id).single(),
    db.from("period_closure_versions")
      .select("id,period_id,version,closure_status,closed_at,realized_gain_cents,commission_cents,trader_result_cents,summary_data")
      .eq("period_id", period.id).order("version", { ascending: false }).limit(1).single(),
  ]);
  if (ownerError || !ownerData || closureError || !closureData) throw new Error("El cierre todavía no posee una versión informable.");
  const owner = ownerData as UserRow;
  const closure = closureData as ClosureRow;

  const { data: accountData, error: accountError } = await db
    .from("accounts").select("id,company_id,reference_number,state,state_origin").eq("period_id", period.id).order("id");
  if (accountError) throw new Error("No se pudieron congelar las cuentas del informe.");
  const accounts = (accountData ?? []) as AccountRow[];
  const accountIds = accounts.map((account) => account.id);
  const companyIds = [...new Set(accounts.map((account) => account.company_id))];
  const [companiesResult, purchasesResult, entriesResult, withdrawalsResult, fundingResult, assignmentsResult, identitiesResult, linksResult, batchesResult] = await Promise.all([
    companyIds.length ? db.from("companies").select("id,display_name").in("id", companyIds) : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("purchases").select("account_id,price_cents").in("account_id", accountIds) : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("operation_entries").select("id,daily_control_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents").in("account_id", accountIds).order("operated_on") : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("account_phase_withdrawals").select("account_id,phase,total_withdrawal_cents").in("account_id", accountIds) : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("funding_withdrawals").select("account_id,period_id").eq("period_id", period.id).eq("is_active", true).in("account_id", accountIds) : Promise.resolve({ data: [], error: null }),
    accountIds.length ? db.from("identity_account_assignments").select("account_id,identity_id,assigned_at,unassigned_at").in("account_id", accountIds).lte("assigned_at", closure.closed_at) : Promise.resolve({ data: [], error: null }),
    db.from("nodal_identities").select("id,first_name,last_name").eq("workspace_id", workspace.id),
    accountIds.length ? db.from("ninja_account_links").select("account_id,external_account_name,linked_at,closed_at").in("account_id", accountIds).order("linked_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    db.from("ninja_operation_batches").select("id,broker_session_id,opened_at,settled_at,operated_on,accounting_phase,accounting_company_id").eq("accounting_period_id", period.id).eq("accounting_status", "committed").order("opened_at", { ascending: false }),
  ]);
  const failed = [companiesResult, purchasesResult, entriesResult, withdrawalsResult, fundingResult, assignmentsResult, identitiesResult, linksResult, batchesResult].find((result) => result.error);
  if (failed) throw new Error("No se pudo congelar el detalle operativo del informe.");

  const batches = (batchesResult.data ?? []) as BatchRow[];
  const batchIds = batches.map((batch) => batch.id);
  const sessionIds = [...new Set(batches.map((batch) => batch.broker_session_id))];
  const [membersResult, manualResult, sessionsResult] = batchIds.length ? await Promise.all([
    db.from("ninja_operation_batch_members").select("batch_id,session_id,account_id,role").in("batch_id", batchIds).eq("role", "prop"),
    db.from("ninja_operation_batch_manual_accounts").select("batch_id,account_id").in("batch_id", batchIds),
    sessionIds.length ? db.from("ninja_operation_probe_sessions").select("id,account_name,opened_at,settled_at,execution_count,instruments,excluded_at").in("id", sessionIds) : Promise.resolve({ data: [], error: null }),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (membersResult.error || manualResult.error || sessionsResult.error) throw new Error("No se pudo congelar el último trade de cada cierre.");

  const companies = new Map((companiesResult.data ?? []).map((company) => [company.id, company.display_name]));
  const purchases = new Map((purchasesResult.data ?? []).map((purchase) => [purchase.account_id, asNumber(purchase.price_cents)]));
  const entries = (entriesResult.data ?? []) as EntryRow[];
  const withdrawals = (withdrawalsResult.data ?? []) as Array<{ account_id: string; phase: string; total_withdrawal_cents: number | string }>;
  const accountResult = new Map(accounts.map((account) => [account.id, finalAccountResult(account, purchases.get(account.id) ?? 0, entries, withdrawals)]));
  const identities = (identitiesResult.data ?? []) as IdentityRow[];
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const assignmentByAccount = new Map(assignments
    .filter((assignment) => !assignment.unassigned_at || assignment.unassigned_at > closure.closed_at)
    .map((assignment) => [assignment.account_id, assignment.identity_id]));
  const identityName = (accountId: string) => {
    const identityId = assignmentByAccount.get(accountId);
    const identity = identityId ? identityById.get(identityId) : null;
    return identity ? `${identity.first_name} ${identity.last_name}` : "Titular";
  };
  const linkByAccount = new Map<string, string>();
  for (const link of linksResult.data ?? []) if (!linkByAccount.has(link.account_id)) linkByAccount.set(link.account_id, link.external_account_name);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountLabel = (accountId: string) => {
    const account = accountById.get(accountId);
    return linkByAccount.get(accountId)
      ?? (account ? `${companies.get(account.company_id) ?? "Cuenta"} ${account.reference_number}` : "Cuenta");
  };
  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const manualRows = (manualResult.data ?? []) as ManualMemberRow[];
  const sessionById = new Map(((sessionsResult.data ?? []) as SessionRow[]).filter((session) => !session.excluded_at).map((session) => [session.id, session]));
  const latestBatchByAccount = new Map<string, string>();
  for (const batch of batches) {
    const batchAccounts = [
      ...memberRows.filter((member) => member.batch_id === batch.id && member.account_id).map((member) => member.account_id!),
      ...manualRows.filter((member) => member.batch_id === batch.id).map((member) => member.account_id),
    ];
    for (const accountId of batchAccounts) if (!latestBatchByAccount.has(accountId)) latestBatchByAccount.set(accountId, batch.id);
  }
  const closedAccounts = accounts.filter((account) => account.state === "closed");
  const operations = batches.flatMap((batch) => {
    const batchAccountIds = closedAccounts
      .filter((account) => latestBatchByAccount.get(account.id) === batch.id)
      .map((account) => account.id);
    if (batchAccountIds.length === 0) return [];
    const session = sessionById.get(batch.broker_session_id);
    const names = [...new Set(batchAccountIds.map(identityName))];
    const company = batch.accounting_company_id ? companies.get(batch.accounting_company_id) : null;
    return [{
      accountCount: batchAccountIds.length,
      accounts: batchAccountIds.map(accountLabel).sort((left, right) => left.localeCompare(right, "es")),
      brokerAccount: session?.account_name ?? null,
      company: company ?? companies.get(accountById.get(batchAccountIds[0])?.company_id ?? "") ?? "Sin empresa",
      executionCount: session?.execution_count ?? 0,
      finalResultInCents: batchAccountIds.reduce((total, accountId) => total + (accountResult.get(accountId) ?? 0), 0),
      identityName: names.join(" / "),
      instruments: instruments(session?.instruments),
      openedAt: session?.opened_at ?? batch.opened_at,
      phaseDay: phaseDay(entries, batchAccountIds, batch.accounting_phase, batch.operated_on ?? batch.opened_at.slice(0, 10)),
    }];
  });
  const coveredAccountIds = new Set(operations.flatMap((operation) => operation.accounts));
  const fallbackOperations = closedAccounts.flatMap((account) => {
    if (coveredAccountIds.has(accountLabel(account.id))) return [];
    const latestEntry = entries.filter((entry) => entry.account_id === account.id).sort((left, right) => right.operated_on.localeCompare(left.operated_on))[0];
    return [{
      accountCount: 1,
      accounts: [accountLabel(account.id)],
      brokerAccount: null,
      company: companies.get(account.company_id) ?? "Sin empresa",
      executionCount: 0,
      finalResultInCents: accountResult.get(account.id) ?? 0,
      identityName: identityName(account.id),
      instruments: [],
      openedAt: latestEntry ? `${latestEntry.operated_on}T00:00:00-03:00` : closure.closed_at,
      phaseDay: phaseDay(entries, [account.id], latestEntry?.phase ?? null, latestEntry?.operated_on ?? period.period_month),
    }];
  });
  const allOperations = [...operations, ...fallbackOperations].sort((left, right) => right.openedAt.localeCompare(left.openedAt));

  const funding = fundingResult.data ?? [];
  const identityKeys = new Set(closedAccounts.map((account) => assignmentByAccount.get(account.id) ?? "titular"));
  const identitySummaries = [...identityKeys].map((key) => {
    const identity = key === "titular" ? null : identityById.get(key);
    const assignedAccountIds = closedAccounts
      .filter((account) => (assignmentByAccount.get(account.id) ?? "titular") === key)
      .map((account) => account.id);
    const payoutCounts = new Map<string, number>();
    for (const payout of funding.filter((row) => assignedAccountIds.includes(row.account_id))) {
      const account = accountById.get(payout.account_id);
      const company = account ? companies.get(account.company_id) ?? "Sin empresa" : "Sin empresa";
      payoutCounts.set(company, (payoutCounts.get(company) ?? 0) + 1);
    }
    return {
      accountCount: assignedAccountIds.length,
      gainInCents: assignedAccountIds.reduce((total, accountId) => total + (accountResult.get(accountId) ?? 0), 0),
      id: identity?.id ?? null,
      name: identity ? `${identity.first_name} ${identity.last_name}` : "Titular",
      payoutsByCompany: [...payoutCounts].map(([company, count]) => ({ company, count })).sort((left, right) => left.company.localeCompare(right.company, "es")),
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "es"));

  const summary = closure.summary_data as unknown as OperationalSummary;
  return {
    closure: { closedAt: closure.closed_at, id: closure.id, status: closure.closure_status, version: closure.version },
    desk: await loadDeskSnapshot(db, owner.id, period.period_month, workspace.modality),
    identities: identitySummaries,
    operations: allOperations,
    owner: { email: owner.email, id: owner.id, name: owner.display_name || owner.email },
    period: {
      id: period.id,
      modality: workspace.modality,
      month: period.period_month,
      operationalStartOn: period.operational_start_on,
      scheduledCloseAt: period.scheduled_close_at,
    },
    schemaVersion: 1,
    summary: {
      accountStates: summary.accountStates ?? { closed: 0, live: 0, virgin: 0 },
      brokerBalanceInCents: summary.brokerBalanceInCents ?? null,
      commissionInCents: asNumber(closure.commission_cents),
      commissionRateLabel: summary.commissionRateLabel ?? "Sin porcentaje",
      floatingInCents: summary.floatingInCents ?? 0,
      fundingPendingInCents: summary.fundingPendingInCents ?? 0,
      positionObservableInCents: summary.positionObservableInCents ?? 0,
      realizedGainInCents: asNumber(closure.realized_gain_cents),
      traderGainInCents: asNumber(closure.trader_result_cents),
      walletBalanceInCents: summary.walletBalanceInCents ?? 0,
    },
  };
}

