import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { accountingPeriodMonthAt } from "@/modules/accounting/domain/period-calendar";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import { calculateAccountResult, type AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";

import {
  calculateDeskOverview,
  latestTerms,
  ROOT_DESK,
  suggestLevel,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "../domain/desks";
import { transmittedWithinLast24Hours } from "../domain/connector-activity";
import { canOpenDeskAdmin } from "../domain/administration-scope";
import { loadMyAdministrationScope } from "./administration-scope";
import { loadPeriodSummaries } from "./load-period-summaries";
import { readAll } from "./read-all";

type ProfileRow = Readonly<{
  access_role: "admin" | "student";
  access_state: string;
  contact_email: string | null;
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
  identities_enabled: boolean;
}>;
type PeriodRow = Readonly<{ id: string; period_month: string }>;
type WorkspaceRow = Readonly<{
  id: string;
  owner_user_id: string;
  periods: PeriodRow[];
}>;
type IdentityRow = Readonly<{
  first_name: string;
  id: string;
  last_name: string;
  onboarding_status: string;
  workspace_id: string;
}>;
type ConnectorRow = Readonly<{
  connector_version: string;
  id: string;
  last_seen_at: string | null;
  owner_user_id: string;
}>;
type IdentifierRow = Readonly<{
  desk_id: string;
  display_id: string;
  reason: string;
  user_id: string;
  valid_from: string;
  valid_to: string | null;
}>;

export type DeskPanelIdentitySummary = Readonly<{ active: number; total: number }>;
export type DeskPanelConnectorSummary = Readonly<{
  active: boolean;
  lastSeenAt: string | null;
  version: string | null;
}>;
export type DeskPanelHistoryPoint = Readonly<{
  administrationIncome: number;
  month: string;
  structureBilling: number;
  totalIncome: number;
}>;
export type DeskPanelIdentityRow = Readonly<{
  billing: number;
  id: string;
  name: string;
  periodGain: number;
  state: string;
}>;
export type DeskPanelInvitation = Readonly<{
  createdAt: string;
  email: string;
  id: string;
  referredByUserId: string;
  status: string;
}>;
export type DeskPanelIdentifierHistory = Readonly<{
  deskId: string;
  displayId: string;
  reason: string;
  validFrom: string;
  validTo: string | null;
}>;
export type DeskPanelUserDetail = Readonly<{
  bestTrade: Readonly<{ amount: number; date: string }> | null;
  identities: readonly DeskPanelIdentityRow[];
  largestGainRoute: string | null;
  performance: readonly Readonly<{ amount: number; label: string }>[];
}>;

function privilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("La lectura protegida de mesas no está configurada.");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function branch(
  rootId: string,
  desks: readonly Desk[],
  terms: readonly DeskTerms[],
  month: string,
) {
  const current = new Map(latestTerms(terms, month, (term) => term.desk_id).map((term) => [term.desk_id, term]));
  const ids = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const id = pending.shift()!;
    if (ids.has(id) || !current.get(id)?.active) continue;
    ids.add(id);
    for (const child of desks) if (child.parent_id === id) pending.push(child.id);
  }
  return ids;
}

export type MyDeskPanelData = Readonly<{
  connectorByUser: Readonly<Record<string, DeskPanelConnectorSummary>>;
  deskId: string | null;
  deskName: string | null;
  detailByUser: Readonly<Record<string, DeskPanelUserDetail>>;
  demo: boolean;
  displayIdByUser: Readonly<Record<string, string>>;
  historicalBillingByUser: Readonly<Record<string, number>>;
  history: readonly DeskPanelHistoryPoint[];
  identitiesByUser: Readonly<Record<string, DeskPanelIdentitySummary>>;
  identifierHistoryByUser: Readonly<Record<string, readonly DeskPanelIdentifierHistory[]>>;
  invitations: readonly DeskPanelInvitation[];
  lastOperatedOnByUser: Readonly<Record<string, string | null>>;
  month: string;
  overview: ReturnType<typeof calculateDeskOverview>;
  preview: boolean;
  priorPeriodGrossByUser: Readonly<Record<string, number>>;
  profilesByUser: Readonly<Record<string, ProfileRow>>;
  summaries: Readonly<Record<string, OperationalSummary | null>>;
  suggestions: Readonly<Record<string, number | null>>;
  termsEditable: boolean;
  userId: string;
}>;

export async function loadMyDeskPanel(): Promise<MyDeskPanelData> {
  const scope = await loadMyAdministrationScope();
  if (!canOpenDeskAdmin(scope)) redirect("/app");

  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/");

  const preview = scope.kind === "preview";
  const deskId = scope.kind === "desk" || scope.kind === "combined" ? scope.deskId : null;
  const deskName = scope.kind === "desk" || scope.kind === "combined" ? scope.deskName : null;
  const service = privilegedClient();
  const month = accountingPeriodMonthAt();
  const [deskRows, deskTermRows, userTermRows] = await Promise.all([
    readAll(service.from("nodal_desks").select("id,name,parent_id,created_at").order("created_at").order("id")),
    readAll(service.from("nodal_desk_terms").select("desk_id,effective_month,manager_id,nodal_bps,active").order("desk_id").order("effective_month")),
    readAll(service.from("nodal_user_terms").select("user_id,effective_month,desk_id,level,state,commission_bps,bonus_enabled").order("user_id").order("effective_month")),
  ]);
  if (deskRows.error || deskTermRows.error || userTermRows.error) {
    throw new Error("No se pudo cargar la estructura administrada.");
  }

  const desks = (deskRows.data ?? []) as Desk[];
  const deskTerms = (deskTermRows.data ?? []) as DeskTerms[];
  const userTerms = (userTermRows.data ?? []) as UserTerms[];
  const branchIds = preview ? new Set([ROOT_DESK]) : branch(deskId!, desks, deskTerms, month);

  if (!preview) {
    const currentDeskTerms = new Map(latestTerms(deskTerms, month, (term) => term.desk_id).map((term) => [term.desk_id, term]));
    const assigned = currentDeskTerms.get(deskId!);
    if (!assigned?.active || assigned.manager_id !== user.id) redirect("/app");
  }

  const currentUserTerms = latestTerms(userTerms, month, (term) => term.user_id);
  const relevantUserIds = preview
    ? new Set([user.id])
    : new Set(currentUserTerms.filter((term) => branchIds.has(term.desk_id)).map((term) => term.user_id));
  relevantUserIds.add(user.id);

  const [
    { data: profiles, error: profileError },
    { data: workspaces, error: workspaceError },
    { data: identifiers, error: identifierError },
  ] = await Promise.all([
    service.from("nodal_users")
      .select("id,email,contact_email,display_name,access_state,access_role,created_at,identities_enabled")
      .in("id", [...relevantUserIds]).order("display_name").order("id"),
    service.from("workspaces")
      .select("id,owner_user_id,periods(id,period_month)")
      .eq("modality", "real").in("owner_user_id", [...relevantUserIds]),
    service.from("nodal_user_identifiers")
      .select("user_id,desk_id,display_id,valid_from,valid_to,reason")
      .in("user_id", [...relevantUserIds])
      .order("valid_from", { ascending: false }),
  ]);
  if (profileError || workspaceError || identifierError) {
    throw new Error("No se pudieron cargar los usuarios de la estructura.");
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  const identifierRows = (identifiers ?? []) as IdentifierRow[];
  const workspaceRows = (workspaces ?? []) as WorkspaceRow[];
  const periodIds = workspaceRows.flatMap((workspace) => workspace.periods
    .filter((period) => period.period_month <= month)
    .map((period) => period.id));
  const summaries = await loadPeriodSummaries(service, periodIds, {
    loadCommission: async (targetUserId, periodMonth) => {
      const terms = latestTerms(
        userTerms.filter((term) => term.user_id === targetUserId),
        periodMonth,
        (term) => term.user_id,
      )[0];
      return terms?.commission_bps ?? null;
    },
  });

  const workspaceIds = workspaceRows.map((workspace) => workspace.id);
  const [identityResult, connectorResult, termsWindowResult] = await Promise.all([
    workspaceIds.length > 0
      ? service.from("nodal_identities").select("id,workspace_id,first_name,last_name,onboarding_status").in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    service.from("ninja_connectors")
      .select("id,owner_user_id,connector_version,last_seen_at")
      .in("owner_user_id", [...relevantUserIds])
      .order("paired_at", { ascending: false }),
    session.rpc("nodal_desk_terms_window_open"),
  ]);
  if (identityResult.error || connectorResult.error || termsWindowResult.error) {
    throw new Error("No se pudo completar el estado de la estructura.");
  }

  const invitationResult = deskId
    ? await service.from("nodal_user_invitations")
      .select("id,recipient_email,referred_by_user_id,status,created_at")
      .eq("desk_id", deskId).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (invitationResult.error) throw new Error("No se pudieron cargar las invitaciones de la mesa.");

  const currentPeriodIds = workspaceRows.flatMap((workspace) => workspace.periods
    .filter((period) => period.period_month === month).map((period) => period.id));
  const accountResult = currentPeriodIds.length > 0
    ? await service.from("accounts")
      .select("id,period_id,company_id,reference_number,state,state_origin")
      .in("period_id", currentPeriodIds)
    : { data: [], error: null };
  if (accountResult.error) throw new Error("No se pudo cargar el detalle operativo de la mesa.");
  const accountRows = accountResult.data ?? [];
  const accountIds = accountRows.map((account) => account.id);
  const connectorRows = (connectorResult.data ?? []) as ConnectorRow[];
  const connectorIds = connectorRows.map((connector) => connector.id);
  const [assignmentResult, purchaseResult, entryResult, withdrawalResult, batchResult, companyResult] = await Promise.all([
    accountIds.length > 0
      ? service.from("identity_account_assignments")
        .select("account_id,identity_id,assigned_at,unassigned_at").in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length > 0
      ? service.from("purchases").select("account_id,price_cents").in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length > 0
      ? service.from("operation_entries")
        .select("id,daily_control_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents")
        .in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length > 0
      ? service.from("account_phase_withdrawals")
        .select("account_id,phase,total_withdrawal_cents").in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    connectorIds.length > 0
      ? service.from("ninja_operation_batches")
        .select("id,connector_id,broker_result_cents,opened_at,operated_on,accounting_company_id,accounting_phase,accounting_period_id,accounting_status")
        .in("connector_id", connectorIds).in("accounting_period_id", currentPeriodIds)
        .eq("accounting_status", "committed")
      : Promise.resolve({ data: [], error: null }),
    service.from("companies").select("id,display_name"),
  ]);
  if ([assignmentResult, purchaseResult, entryResult, withdrawalResult, batchResult, companyResult]
    .some((result) => result.error)) throw new Error("No se pudo reconstruir la ficha económica de los usuarios.");

  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const periodsByUser = new Map(workspaceRows.map((workspace) => [workspace.owner_user_id, workspace.periods]));
  const periodByUserAndMonth = new Map(workspaceRows.flatMap((workspace) => workspace.periods
    .map((period) => [`${workspace.owner_user_id}:${period.period_month}`, period] as const)));
  const visibleDesks = preview
    ? desks.filter((desk) => desk.id === ROOT_DESK)
    : desks.filter((desk) => branchIds.has(desk.id));
  const visibleDeskTerms = preview
    ? deskTerms.filter((term) => term.desk_id === ROOT_DESK)
    : deskTerms.filter((term) => branchIds.has(term.desk_id));

  const buildOverview = (periodMonth: string) => {
    const people: Person[] = [...relevantUserIds].flatMap((id) => {
      const profile = profilesById.get(id);
      if (!profile) return [];
      const period = periodByUserAndMonth.get(`${id}:${periodMonth}`);
      const summary = summaries.get(period?.id ?? "")?.summary;
      return [{
        access: profile.access_state,
        email: profile.email,
        gross: summary?.realizedGainInCents ?? 0,
        id: profile.id,
        legacyCommission: summary?.commissionInCents ?? 0,
        master: profile.access_role === "admin",
        name: profile.display_name || profile.email,
      }];
    });
    return calculateDeskOverview(
      visibleDesks,
      visibleDeskTerms,
      people,
      userTerms.filter((term) => relevantUserIds.has(term.user_id)),
      periodMonth,
    );
  };

  const months = [...new Set(workspaceRows.flatMap((workspace) => workspace.periods
    .filter((period) => period.period_month <= month)
    .map((period) => period.period_month)))].sort();
  if (!months.includes(month)) months.push(month);
  const snapshots = months.map((periodMonth) => ({ month: periodMonth, overview: buildOverview(periodMonth) }));
  const overview = snapshots.find((snapshot) => snapshot.month === month)!.overview;
  const currentPeriods = new Map(workspaceRows.flatMap((workspace) => workspace.periods
    .filter((period) => period.period_month === month)
    .map((period) => [workspace.owner_user_id, period] as const)));
  const previousMonth = months.filter((candidate) => candidate < month).at(-1) ?? null;

  const summaryRecord: Record<string, OperationalSummary | null> = {};
  const lastOperatedOnByUser: Record<string, string | null> = {};
  const suggestions: Record<string, number | null> = {};
  const historicalBillingByUser: Record<string, number> = {};
  const priorPeriodGrossByUser: Record<string, number> = {};
  for (const person of overview.people) {
    summaryRecord[person.id] = summaries.get(currentPeriods.get(person.id)?.id ?? "")?.summary ?? null;
    lastOperatedOnByUser[person.id] = summaries.get(currentPeriods.get(person.id)?.id ?? "")?.lastOperatedOn ?? null;
    const prior = (periodsByUser.get(person.id) ?? [])
      .filter((period) => period.period_month < month)
      .sort((left, right) => right.period_month.localeCompare(left.period_month));
    suggestions[person.id] = suggestLevel(person.terms?.level ?? 1, prior.slice(0, 2).map((period) => ({
      gross: summaries.get(period.id)?.summary.realizedGainInCents ?? 0,
      month: period.period_month,
    })));
    historicalBillingByUser[person.id] = (periodsByUser.get(person.id) ?? []).reduce(
      (total, period) => total + (summaries.get(period.id)?.summary.realizedGainInCents ?? 0), 0,
    );
    const previousPeriod = previousMonth ? periodByUserAndMonth.get(`${person.id}:${previousMonth}`) : null;
    priorPeriodGrossByUser[person.id] = summaries.get(previousPeriod?.id ?? "")?.summary.realizedGainInCents ?? 0;
  }

  const workspaceOwnerById = new Map(workspaceRows.map((workspace) => [workspace.id, workspace.owner_user_id]));
  const identitiesByUser: Record<string, DeskPanelIdentitySummary> = {};
  for (const id of relevantUserIds) identitiesByUser[id] = { active: 0, total: 0 };
  for (const identity of (identityResult.data ?? []) as IdentityRow[]) {
    const ownerId = workspaceOwnerById.get(identity.workspace_id);
    if (!ownerId) continue;
    const current = identitiesByUser[ownerId] ?? { active: 0, total: 0 };
    identitiesByUser[ownerId] = {
      active: current.active + (identity.onboarding_status === "approved" ? 1 : 0),
      total: current.total + 1,
    };
  }

  const connectorByUser: Record<string, DeskPanelConnectorSummary> = {};
  for (const connector of connectorRows) {
    if (connectorByUser[connector.owner_user_id]) continue;
    connectorByUser[connector.owner_user_id] = {
      active: transmittedWithinLast24Hours(connector.last_seen_at),
      lastSeenAt: connector.last_seen_at,
      version: connector.connector_version || null,
    };
  }

  const identifierHistoryByUser: Record<string, DeskPanelIdentifierHistory[]> = {};
  for (const identifier of identifierRows) {
    identifierHistoryByUser[identifier.user_id] = [
      ...(identifierHistoryByUser[identifier.user_id] ?? []),
      {
        deskId: identifier.desk_id,
        displayId: identifier.display_id,
        reason: identifier.reason,
        validFrom: identifier.valid_from,
        validTo: identifier.valid_to,
      },
    ];
  }

  const currentPeriodOwner = new Map(workspaceRows.flatMap((workspace) => workspace.periods
    .filter((period) => period.period_month === month)
    .map((period) => [period.id, workspace.owner_user_id] as const)));
  const purchaseByAccount = new Map((purchaseResult.data ?? [])
    .map((purchase) => [purchase.account_id, Number(purchase.price_cents)] as const));
  const rawEntries = entryResult.data ?? [];
  const rawWithdrawals = withdrawalResult.data ?? [];
  const accountGain = new Map<string, number>();
  for (const account of accountRows) {
    const operationEntries: OperationRegisterEntry[] = rawEntries
      .filter((entry) => entry.account_id === account.id)
      .map((entry) => ({
        accountId: account.id,
        accountReference: account.reference_number,
        companyId: account.company_id,
        companyName: "",
        dailyControlId: entry.daily_control_id,
        destination: entry.destination as OperationRegisterEntry["destination"],
        id: entry.id,
        magnitudeInCents: Number(entry.magnitude_cents),
        operatedOn: entry.operated_on,
        participantRole: entry.participant_role as OperationRegisterEntry["participantRole"],
        phase: entry.phase as OperationRegisterEntry["phase"],
      }));
    const phaseWithdrawals: AccountPhaseWithdrawal[] = rawWithdrawals
      .filter((withdrawal) => withdrawal.account_id === account.id && withdrawal.phase !== "Evaluacion")
      .map((withdrawal) => ({
        accountId: account.id,
        phase: withdrawal.phase as AccountPhaseWithdrawal["phase"],
        totalWithdrawalInCents: Number(withdrawal.total_withdrawal_cents),
      }));
    const calculated = calculateAccountResult(
      operationEntries,
      phaseWithdrawals,
      (account.state_origin ?? "automatic") as "automatic" | "manual_closed" | "manual_live",
      purchaseByAccount.get(account.id) ?? 0,
    );
    accountGain.set(account.id,
      [...calculated.phaseResults].reverse().find((phase) => phase.totalGainInCents !== 0)?.totalGainInCents ?? 0);
  }
  const currentAssignmentByAccount = new Map((assignmentResult.data ?? [])
    .filter((assignment) => !assignment.unassigned_at)
    .map((assignment) => [assignment.account_id, assignment.identity_id] as const));
  const accountsByOwner = new Map<string, typeof accountRows>();
  for (const account of accountRows) {
    const ownerId = currentPeriodOwner.get(account.period_id);
    if (!ownerId) continue;
    accountsByOwner.set(ownerId, [...(accountsByOwner.get(ownerId) ?? []), account]);
  }
  const connectorOwner = new Map(connectorRows.map((connector) => [connector.id, connector.owner_user_id]));
  const companies = new Map((companyResult.data ?? []).map((company) => [company.id, company.display_name]));
  const batchesByOwner = new Map<string, typeof batchResult.data>();
  for (const batch of batchResult.data ?? []) {
    const ownerId = connectorOwner.get(batch.connector_id);
    if (!ownerId) continue;
    batchesByOwner.set(ownerId, [...(batchesByOwner.get(ownerId) ?? []), batch]);
  }
  const identitiesByWorkspace = new Map<string, IdentityRow[]>();
  for (const identity of (identityResult.data ?? []) as IdentityRow[]) {
    identitiesByWorkspace.set(identity.workspace_id, [...(identitiesByWorkspace.get(identity.workspace_id) ?? []), identity]);
  }
  const workspaceByOwner = new Map(workspaceRows.map((workspace) => [workspace.owner_user_id, workspace]));
  const detailByUser: Record<string, DeskPanelUserDetail> = {};
  for (const person of overview.people) {
    const userBatches = [...(batchesByOwner.get(person.id) ?? [])]
      .sort((left, right) => Number(right.broker_result_cents) - Number(left.broker_result_cents));
    const best = userBatches[0];
    const userAccounts = accountsByOwner.get(person.id) ?? [];
    const workspace = workspaceByOwner.get(person.id);
    const userIdentities = workspace ? identitiesByWorkspace.get(workspace.id) ?? [] : [];
    detailByUser[person.id] = {
      bestTrade: best ? {
        amount: Number(best.broker_result_cents),
        date: best.operated_on ?? best.opened_at.slice(0, 10),
      } : null,
      identities: userIdentities.map((identity) => {
        const assigned = userAccounts.filter((account) => currentAssignmentByAccount.get(account.id) === identity.id);
        return {
          billing: assigned.filter((account) => account.state === "closed")
            .reduce((total, account) => total + (accountGain.get(account.id) ?? 0), 0),
          id: identity.id,
          name: `${identity.first_name} ${identity.last_name}`,
          periodGain: assigned.reduce((total, account) => total + (accountGain.get(account.id) ?? 0), 0),
          state: identity.onboarding_status === "approved" ? "Activa"
            : identity.onboarding_status === "inactive" ? "Inactiva" : "Pendiente",
        };
      }),
      largestGainRoute: best
        ? [companies.get(best.accounting_company_id ?? ""), best.accounting_phase]
          .filter(Boolean).join(" · ") || "Operación sin clasificación"
        : null,
      performance: snapshots.map((snapshot) => ({
        amount: snapshot.overview.people.find((candidate) => candidate.id === person.id)?.gross ?? 0,
        label: snapshot.month.slice(0, 7),
      })),
    };
  }

  return {
    connectorByUser,
    deskId,
    deskName,
    detailByUser,
    demo: false,
    displayIdByUser: Object.fromEntries(identifierRows
      .filter((identifier) => identifier.valid_to === null)
      .map((identifier) => [identifier.user_id, identifier.display_id])),
    historicalBillingByUser,
    history: snapshots.map((snapshot) => {
      const snapshotDesk = deskId ? snapshot.overview.desks.find((desk) => desk.id === deskId) : null;
      const manager = snapshot.overview.people.find((person) => person.id === user.id);
      return {
        administrationIncome: manager?.mesaIncome ?? 0,
        month: snapshot.month,
        structureBilling: snapshotDesk?.structureGross ?? manager?.gross ?? 0,
        totalIncome: manager?.totalIncome ?? 0,
      };
    }),
    identitiesByUser,
    identifierHistoryByUser,
    invitations: (invitationResult.data ?? []).map((invitation) => ({
      createdAt: invitation.created_at,
      email: invitation.recipient_email,
      id: invitation.id,
      referredByUserId: invitation.referred_by_user_id,
      status: invitation.status,
    })),
    lastOperatedOnByUser,
    month,
    overview,
    preview,
    priorPeriodGrossByUser,
    profilesByUser: Object.fromEntries(profileRows.map((profile) => [profile.id, profile])),
    summaries: summaryRecord,
    suggestions,
    termsEditable: scope.kind === "combined" || Boolean(termsWindowResult.data),
    userId: user.id,
  };
}
