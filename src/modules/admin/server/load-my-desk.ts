import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { accountingPeriodMonthAt } from "@/modules/accounting/domain/period-calendar";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

import {
  calculateDeskOverview,
  latestTerms,
  suggestLevel,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "../domain/desks";
import { loadMyAdministrationScope } from "./administration-scope";
import { loadPeriodSummaries } from "./load-period-summaries";
import { readAll } from "./read-all";

type ProfileRow = Readonly<{
  access_role: "admin" | "student";
  access_state: string;
  display_name: string | null;
  email: string;
  id: string;
}>;

type PeriodRow = Readonly<{ id: string; period_month: string }>;
type WorkspaceRow = Readonly<{
  owner_user_id: string;
  periods: PeriodRow[];
}>;

function privilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("La lectura protegida de mesas no está configurada.");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function activeBranch(
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
  deskId: string;
  month: string;
  overview: ReturnType<typeof calculateDeskOverview>;
  summaries: Readonly<Record<string, OperationalSummary | null>>;
  suggestions: Readonly<Record<string, number | null>>;
  userId: string;
}>;

export async function loadMyDeskPanel(): Promise<MyDeskPanelData> {
  const scope = await loadMyAdministrationScope();
  if (scope.kind === "master") redirect("/app/admin");
  if (scope.kind !== "desk") redirect("/app");

  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/");

  const service = privilegedClient();
  const month = accountingPeriodMonthAt();
  const [deskRows, deskTermRows, userTermRows] = await Promise.all([
    readAll(service.from("nodal_desks").select("id,name,parent_id,created_at").order("created_at").order("id")),
    readAll(service.from("nodal_desk_terms").select("desk_id,effective_month,manager_id,nodal_bps,active").order("desk_id").order("effective_month")),
    readAll(service.from("nodal_user_terms").select("user_id,effective_month,desk_id,level,state,commission_bps,bonus_enabled").order("user_id").order("effective_month")),
  ]);
  if (deskRows.error || deskTermRows.error || userTermRows.error) {
    throw new Error("No se pudo cargar la mesa administrada.");
  }

  const desks = (deskRows.data ?? []) as Desk[];
  const deskTerms = (deskTermRows.data ?? []) as DeskTerms[];
  const userTerms = (userTermRows.data ?? []) as UserTerms[];
  const currentDeskTerms = new Map(latestTerms(deskTerms, month, (term) => term.desk_id).map((term) => [term.desk_id, term]));
  const assigned = currentDeskTerms.get(scope.deskId);
  if (!assigned?.active || assigned.manager_id !== user.id) redirect("/app");

  const branchIds = activeBranch(scope.deskId, desks, deskTerms, month);
  const currentUserTerms = latestTerms(userTerms, month, (term) => term.user_id);
  const relevantUserIds = new Set(
    currentUserTerms
      .filter((term) => branchIds.has(term.desk_id))
      .map((term) => term.user_id),
  );
  relevantUserIds.add(user.id);

  const [{ data: profiles, error: profileError }, { data: workspaces, error: workspaceError }] = await Promise.all([
    service
      .from("nodal_users")
      .select("id,email,display_name,access_state,access_role")
      .in("id", [...relevantUserIds])
      .order("display_name")
      .order("id"),
    service
      .from("workspaces")
      .select("owner_user_id,periods(id,period_month)")
      .eq("modality", "real")
      .in("owner_user_id", [...relevantUserIds]),
  ]);
  if (profileError || workspaceError) throw new Error("No se pudieron cargar los usuarios de la mesa.");

  const workspaceRows = (workspaces ?? []) as WorkspaceRow[];
  const periodIds = workspaceRows.flatMap((workspace) => {
    const eligible = workspace.periods
      .filter((period) => period.period_month <= month)
      .sort((left, right) => right.period_month.localeCompare(left.period_month));
    return eligible.slice(0, 3).map((period) => period.id);
  });
  const summaries = await loadPeriodSummaries(service, periodIds, {
    loadCommission: async (userId, periodMonth) => {
      const terms = latestTerms(
        userTerms.filter((term) => term.user_id === userId),
        periodMonth,
        (term) => term.user_id,
      )[0];
      return terms?.commission_bps ?? null;
    },
  });

  const currentPeriods = new Map(
    workspaceRows.flatMap((workspace) => workspace.periods
      .filter((period) => period.period_month === month)
      .map((period) => [workspace.owner_user_id, period] as const)),
  );
  const profilesById = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const people: Person[] = [...relevantUserIds].flatMap((id) => {
    const profile = profilesById.get(id);
    if (!profile) return [];
    const summary = summaries.get(currentPeriods.get(id)?.id ?? "")?.summary;
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
  const branchDesks = desks.filter((desk) => branchIds.has(desk.id));
  const overview = calculateDeskOverview(
    branchDesks,
    deskTerms.filter((term) => branchIds.has(term.desk_id)),
    people,
    userTerms.filter((term) => relevantUserIds.has(term.user_id)),
    month,
  );

  const summaryRecord: Record<string, OperationalSummary | null> = {};
  const suggestions: Record<string, number | null> = {};
  for (const person of overview.people) {
    const currentPeriod = currentPeriods.get(person.id);
    summaryRecord[person.id] = summaries.get(currentPeriod?.id ?? "")?.summary ?? null;
    const prior = (workspaceRows.find((workspace) => workspace.owner_user_id === person.id)?.periods ?? [])
      .filter((period) => period.period_month < month)
      .sort((left, right) => right.period_month.localeCompare(left.period_month))
      .slice(0, 2)
      .map((period) => ({
        gross: summaries.get(period.id)?.summary.realizedGainInCents ?? 0,
        month: period.period_month,
      }));
    suggestions[person.id] = suggestLevel(person.terms?.level ?? 1, prior);
  }

  return {
    deskId: scope.deskId,
    month,
    overview,
    summaries: summaryRecord,
    suggestions,
    userId: user.id,
  };
}

