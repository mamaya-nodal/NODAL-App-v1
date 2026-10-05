import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { accountingPeriodMonthAt } from "@/modules/accounting/domain/period-calendar";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

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
import { canOpenDeskAdmin } from "../domain/administration-scope";
import { loadMyAdministrationScope } from "./administration-scope";
import { loadPeriodSummaries } from "./load-period-summaries";
import { readAll } from "./read-all";

type ProfileRow = Readonly<{
  access_role: "admin" | "student";
  access_state: string;
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
}>;
type PeriodRow = Readonly<{ id: string; period_month: string }>;
type WorkspaceRow = Readonly<{
  id: string;
  owner_user_id: string;
  periods: PeriodRow[];
}>;
type IdentityRow = Readonly<{ onboarding_status: string; workspace_id: string }>;
type ConnectorRow = Readonly<{
  connector_version: string;
  last_seen_at: string | null;
  owner_user_id: string;
  status: string;
}>;

export type DeskPanelIdentitySummary = Readonly<{ active: number; total: number }>;
export type DeskPanelConnectorSummary = Readonly<{ online: boolean; version: string | null }>;
export type DeskPanelHistoryPoint = Readonly<{
  administrationIncome: number;
  month: string;
  structureBilling: number;
  totalIncome: number;
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

function online(lastSeenAt: string | null) {
  return lastSeenAt ? Date.now() - Date.parse(lastSeenAt) <= 60_000 : false;
}

export type MyDeskPanelData = Readonly<{
  connectorByUser: Readonly<Record<string, DeskPanelConnectorSummary>>;
  deskId: string | null;
  deskName: string | null;
  historicalBillingByUser: Readonly<Record<string, number>>;
  history: readonly DeskPanelHistoryPoint[];
  identitiesByUser: Readonly<Record<string, DeskPanelIdentitySummary>>;
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

  const [{ data: profiles, error: profileError }, { data: workspaces, error: workspaceError }] = await Promise.all([
    service.from("nodal_users")
      .select("id,email,display_name,access_state,access_role,created_at")
      .in("id", [...relevantUserIds]).order("display_name").order("id"),
    service.from("workspaces")
      .select("id,owner_user_id,periods(id,period_month)")
      .eq("modality", "real").in("owner_user_id", [...relevantUserIds]),
  ]);
  if (profileError || workspaceError) throw new Error("No se pudieron cargar los usuarios de la estructura.");

  const profileRows = (profiles ?? []) as ProfileRow[];
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
      ? service.from("nodal_identities").select("workspace_id,onboarding_status").in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    service.from("ninja_connectors")
      .select("owner_user_id,status,connector_version,last_seen_at")
      .in("owner_user_id", [...relevantUserIds])
      .order("paired_at", { ascending: false }),
    session.rpc("nodal_desk_terms_window_open"),
  ]);
  if (identityResult.error || connectorResult.error || termsWindowResult.error) {
    throw new Error("No se pudo completar el estado de la estructura.");
  }

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
  for (const connector of (connectorResult.data ?? []) as ConnectorRow[]) {
    if (connectorByUser[connector.owner_user_id]) continue;
    connectorByUser[connector.owner_user_id] = {
      online: connector.status === "active" && online(connector.last_seen_at),
      version: connector.connector_version || null,
    };
  }

  return {
    connectorByUser,
    deskId,
    deskName,
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
    lastOperatedOnByUser,
    month,
    overview,
    preview,
    priorPeriodGrossByUser,
    profilesByUser: Object.fromEntries(profileRows.map((profile) => [profile.id, profile])),
    summaries: summaryRecord,
    suggestions,
    termsEditable: Boolean(termsWindowResult.data),
    userId: user.id,
  };
}
