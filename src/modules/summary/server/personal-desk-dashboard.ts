import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  calculateDeskOverview,
  latestTerms,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "@/modules/admin/domain/desks";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import { readAll } from "@/modules/admin/server/read-all";
import {
  buildPersonalDeskDashboard,
  type PersonalDeskSnapshot,
} from "@/modules/summary/domain/personal-desk-dashboard";

type ProfileRow = Readonly<{
  access_role: "admin" | "student";
  access_state: string;
  display_name: string | null;
  email: string;
  id: string;
}>;
type PeriodRow = Readonly<{ id: string; period_month: string }>;
type WorkspaceRow = Readonly<{ owner_user_id: string; periods: PeriodRow[] }>;

function privilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("La lectura protegida del dashboard no está configurada.");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadPersonalDeskDashboard(selectedMonth: string, verifiedUserId?: string) {
  let userId = verifiedUserId;
  if (!userId) {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    userId = user?.id;
  }
  if (!userId) return null;

  const service = privilegedClient();
  const [profileRows, workspaceRows, deskRows, deskTermRows, userTermRows] = await Promise.all([
    readAll(service.from("nodal_users").select("id,email,display_name,access_state,access_role").order("id")),
    readAll(service.from("workspaces").select("owner_user_id,periods(id,period_month)").eq("modality", "real").order("id")),
    readAll(service.from("nodal_desks").select("id,name,parent_id,created_at").order("created_at").order("id")),
    readAll(service.from("nodal_desk_terms").select("desk_id,effective_month,manager_id,nodal_bps,active").order("desk_id").order("effective_month")),
    readAll(service.from("nodal_user_terms").select("user_id,effective_month,desk_id,level,state,commission_bps,bonus_enabled").order("user_id").order("effective_month")),
  ]);
  const failed = [profileRows, workspaceRows, deskRows, deskTermRows, userTermRows].find((result) => result.error);
  if (failed) throw new Error("No se pudo calcular la estructura económica del dashboard.");

  const profiles = (profileRows.data ?? []) as ProfileRow[];
  const workspaces = (workspaceRows.data ?? []) as WorkspaceRow[];
  const desks = (deskRows.data ?? []) as Desk[];
  const deskTerms = (deskTermRows.data ?? []) as DeskTerms[];
  const userTerms = (userTermRows.data ?? []) as UserTerms[];
  const personalWorkspace = workspaces.find((workspace) => workspace.owner_user_id === userId);
  const months = [...new Set((personalWorkspace?.periods ?? [])
    .filter((period) => period.period_month <= selectedMonth)
    .map((period) => period.period_month))]
    .sort();
  if (!months.includes(selectedMonth)) return null;

  const periods = workspaces.flatMap((workspace) => workspace.periods
    .filter((period) => months.includes(period.period_month))
    .map((period) => ({ ...period, userId: workspace.owner_user_id })));
  const summaries = await loadPeriodSummaries(service, periods.map((period) => period.id), {
    loadCommission: async (userId, periodMonth) => {
      const terms = latestTerms(
        userTerms.filter((term) => term.user_id === userId),
        periodMonth,
        (term) => term.user_id,
      )[0];
      return terms?.commission_bps ?? null;
    },
  });

  const snapshots: PersonalDeskSnapshot[] = months.map((month) => {
    const people: Person[] = profiles
      .filter((profile) => profile.access_state !== "pending")
      .map((profile) => {
        const period = periods.find(
          (candidate) => candidate.userId === profile.id && candidate.period_month === month,
        );
        const summary = summaries.get(period?.id ?? "")?.summary;
        return {
          access: profile.access_state,
          email: profile.email,
          gross: summary?.realizedGainInCents ?? 0,
          id: profile.id,
          legacyCommission: summary?.commissionInCents ?? 0,
          master: profile.access_role === "admin",
          name: profile.display_name || profile.email,
        };
      });
    return {
      month,
      overview: calculateDeskOverview(desks, deskTerms, people, userTerms, month),
    };
  });

  return buildPersonalDeskDashboard({
    currentMonth: selectedMonth,
    snapshots,
    userId,
  });
}
