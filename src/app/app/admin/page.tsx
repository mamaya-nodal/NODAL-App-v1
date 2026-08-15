import { AdminOverview } from "./admin-overview";
import { buildAdminStudentOverview } from "@/modules/admin/domain/admin-overview";
import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

type Props = { searchParams: Promise<{ mode?: string | string[]; period?: string | string[] }> };
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default async function AdminPage({ searchParams }: Props) {
  const supabase = await requireNodalAdmin();
  const { mode: requestedMode, period: requestedPeriod } = await searchParams;
  const modality = one(requestedMode) === "practice" ? "practice" : "real";
  const [{ data: users }, { data: workspaces }] = await Promise.all([
    supabase.from("nodal_users").select("id, email, display_name, access_state, access_role").eq("access_state", "active").eq("access_role", "student"),
    supabase.from("workspaces").select("id, owner_user_id, modality, periods(id, period_month)").eq("modality", modality),
  ]);
  const periods = [...new Set((workspaces ?? []).flatMap((workspace) => workspace.periods.map((item) => item.period_month)))].sort((a, b) => b.localeCompare(a));
  const period = periods.includes(one(requestedPeriod) ?? "") ? one(requestedPeriod)! : periods[0];
  const workspaceByOwner = new Map((workspaces ?? []).map((workspace) => [workspace.owner_user_id, workspace]));
  const periodByOwner = new Map((users ?? []).flatMap((user) => {
    const selected = workspaceByOwner.get(user.id)?.periods.find((item) => item.period_month === period);
    return selected ? [[user.id, selected.id] as const] : [];
  }));
  const summaries = await loadPeriodSummaries(supabase, [...periodByOwner.values()]);
  const students = (users ?? []).map((user) => {
    const loaded = summaries.get(periodByOwner.get(user.id) ?? "");
    return buildAdminStudentOverview({ email: user.email, id: user.id, lastOperatedOn: loaded?.lastOperatedOn ?? null, name: user.display_name, summary: loaded?.summary ?? emptySummary }, today());
  }).sort((left, right) => left.name.localeCompare(right.name));
  return <AdminOverview modality={modality} period={period ?? ""} periods={periods} students={students} />;
}

const emptySummary: OperationalSummary = { accountStates: { closed: 0, live: 0, virgin: 0 }, brokerBalanceInCents: null, capitalNetInCents: 0, commissionInCents: 0, commissionRateLabel: "Sin comisión", floatingInCents: 0, fundingCollectedInCents: 0, fundingPendingInCents: 0, fundingWithdrawals: [], manualAccountStateCount: 0, periodResultInCents: 0, positionDifferenceInCents: 0, positionExpectedInCents: 0, positionObservableInCents: 0, realizedGainInCents: 0, realizedReconciliationDifferenceInCents: 0, traderGainInCents: 0, virginPriceInCents: 0, walletBalanceInCents: 0, walletMovements: [] };
