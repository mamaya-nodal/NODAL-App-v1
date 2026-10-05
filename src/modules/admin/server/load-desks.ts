import { requireNodalAdmin } from "./admin-access";
import { readAll } from "./read-all";
import { loadPeriodSummaries } from "./load-period-summaries";
import { accountingPeriodMonthAt } from "@/modules/accounting/domain/period-calendar";
import {
  calculateDeskOverview,
  ROOT_DESK,
  type Desk,
  type DeskTerms,
  type UserTerms,
} from "../domain/desks";

export async function loadDesks(
  mode: "real" | "practice",
  requestedMonth?: string,
) {
  const db = await requireNodalAdmin();
  const [users, spaces, desks, terms, userTerms, history] = await Promise.all([
    readAll(db
      .from("nodal_users")
      .select("id,email,display_name,access_state,access_role")
      .order("display_name").order("id")),
    readAll(db
      .from("workspaces")
      .select("owner_user_id,periods(id,period_month)")
      .eq("modality", mode).order("id")),
    readAll(db.from("nodal_desks").select("*").order("created_at").order("id")),
    readAll(db.from("nodal_desk_terms").select("*").order("desk_id").order("effective_month")),
    readAll(db.from("nodal_user_terms").select("*").order("user_id").order("effective_month")),
    db
      .from("nodal_management_history")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);
  if (users.error || spaces.error)
    throw new Error("No se pudieron cargar los usuarios.");
  const missing = [desks, terms, userTerms, history].some(
    (r) => r.error && ["42P01", "PGRST205"].includes(r.error.code),
  );
  if (!missing && [desks, terms, userTerms, history].some((r) => r.error))
    throw new Error("No se pudo cargar la estructura de mesas.");
  const currentMonth = accountingPeriodMonthAt();
  const periods = [
    ...new Set([
      currentMonth,
      ...(spaces.data ?? []).flatMap((s) =>
        s.periods.map((p) => p.period_month),
      ),
    ]),
  ]
    .sort()
    .reverse();
  const month = periods.includes(requestedMonth ?? "")
    ? requestedMonth!
    : currentMonth;
  const allPeriods = (spaces.data ?? []).flatMap((s) =>
    s.periods
      .filter((p) => p.period_month <= month)
      .map((p) => ({ ...p, user: s.owner_user_id })),
  );
  const summaries = await loadPeriodSummaries(
    db,
    allPeriods.map((p) => p.id),
  );
  const deskRows: Desk[] = missing
    ? [
        {
          id: ROOT_DESK,
          name: "Mesa principal NODAL",
          parent_id: null,
          created_at: "",
        },
      ]
    : (desks.data ?? []);
  const deskSettings: DeskTerms[] = missing
    ? [
        {
          desk_id: ROOT_DESK,
          effective_month: "2000-01-01",
          manager_id: null,
          nodal_bps: 10000,
          active: true,
        },
      ]
    : (terms.data ?? []);
  const settings: UserTerms[] = missing ? [] : (userTerms.data ?? []);
  const build = (period: string) =>
    calculateDeskOverview(
      deskRows,
      deskSettings,
      (users.data ?? [])
        .filter((u) => u.access_state !== "pending")
        .map((u) => {
          const p = allPeriods.find(
            (p) => p.user === u.id && p.period_month === period,
          );
          const summary = summaries.get(p?.id ?? "")?.summary;
          return {
            id: u.id,
            name: u.display_name || u.email,
            email: u.email,
            access: u.access_state,
            master: u.access_role === "admin",
            gross: summary?.realizedGainInCents ?? 0,
            legacyCommission: summary?.commissionInCents ?? 0,
          };
        }),
      settings,
      period,
    );
  const overview = build(month);
  const historical = periods
    .filter((p) => p <= month)
    .map((p) => ({ month: p, overview: build(p) }));
  const historicCommission = Object.fromEntries(
    overview.people.map((p) => [
      p.id,
      historical.reduce(
        (s, h) =>
          s + (h.overview.people.find((u) => u.id === p.id)?.commission ?? 0),
        0,
      ),
    ]),
  );
  return {
    overview,
    pendingAccessCount: (users.data ?? []).filter((user) => user.access_state === "pending").length,
    mode,
    month,
    periods,
    currentMonth,
    ready: !missing,
    historicCommission,
    chart: historical
      .slice(0, 12)
      .reverse()
      .map((h) => ({
        month: h.month,
        values: Object.fromEntries(
          h.overview.desks.map((d) => [d.id, d.gross]),
        ),
      })),
    history: (history.data ?? []).map((h) => ({
      id: String(h.id),
      userId: h.user_id as string | null,
      deskId: h.desk_id as string | null,
      actor:
        (users.data ?? []).find((u) => u.id === h.actor_id)?.display_name ||
        "Admin Master",
      at: h.occurred_at as string,
      month: h.effective_month as string,
      action: h.action as string,
      before: h.before_data as Record<string, unknown> | null,
      after: h.after_data as Record<string, unknown>,
    })),
  };
}
export type DeskPanelData = Awaited<ReturnType<typeof loadDesks>>;
