import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { readAll } from "@/modules/admin/server/read-all";

type SummaryData = Readonly<{
  positionDifferenceInCents?: number;
  realizedReconciliationDifferenceInCents?: number;
}>;

export async function loadPeriodCloseControl() {
  const db = await requireNodalAdmin();
  const [users, workspaces, periods, closures, resolutions, approvals, dispatches, reports, runs] = await Promise.all([
    readAll(db.from("nodal_users").select("id,display_name,email").order("id")),
    readAll(db.from("workspaces").select("id,owner_user_id,modality").order("id")),
    readAll(db.from("periods").select("id,workspace_id,period_month,lifecycle_status,scheduled_close_at,closed_at").order("scheduled_close_at", { ascending: false })),
    readAll(db.from("period_closure_versions").select("id,period_id,version,closure_status,scheduled_close_at,closed_at,realized_gain_cents,commission_cents,trader_result_cents,summary_data,reason").order("period_id").order("version", { ascending: false })),
    readAll(db.from("period_closure_observation_resolutions").select("id,period_id,closure_version_id,resolution,evidence,resolved_at").order("resolved_at", { ascending: false })),
    readAll(db.from("period_closure_approvals").select("id,period_id,closure_version_id,approved_by,approved_at").order("approved_at", { ascending: false })),
    readAll(db.from("period_closure_dispatches").select("id,closure_version_id,recipient_email,sender_email,subject,delivery_status,created_at,queued_at,sent_at,failure_message").order("created_at", { ascending: false })),
    readAll(db.from("period_closure_reports").select("id,closure_version_id,report_status,generated_at,failure_message").order("created_at", { ascending: false })),
    db.from("accounting_period_close_runs").select("id,trigger_source,status,due_period_count,closed_period_count,failures,started_at,completed_at").order("started_at", { ascending: false }).limit(20),
  ]);

  const failed = [users, workspaces, periods, closures, resolutions, approvals, dispatches, reports, runs].find((result) => result.error);
  if (failed) throw new Error("No se pudo cargar el control de cierres.");

  const userById = new Map((users.data ?? []).map((user) => [user.id, user]));
  const workspaceById = new Map((workspaces.data ?? []).map((workspace) => [workspace.id, workspace]));
  type ClosureRow = NonNullable<typeof closures.data>[number];
  const latestClosureByPeriod = new Map<string, ClosureRow>();
  for (const closure of closures.data ?? []) {
    if (!latestClosureByPeriod.has(closure.period_id)) latestClosureByPeriod.set(closure.period_id, closure);
  }
  const resolutionByClosure = new Map((resolutions.data ?? []).map((resolution) => [resolution.closure_version_id, resolution]));
  const approvalByClosure = new Map((approvals.data ?? []).map((approval) => [approval.closure_version_id, approval]));
  const dispatchByClosure = new Map((dispatches.data ?? []).map((dispatch) => [dispatch.closure_version_id, dispatch]));
  const reportByClosure = new Map((reports.data ?? []).map((report) => [report.closure_version_id, report]));

  const periodRows = (periods.data ?? []).map((period) => {
    const workspace = workspaceById.get(period.workspace_id);
    const user = workspace ? userById.get(workspace.owner_user_id) : null;
    const closure = latestClosureByPeriod.get(period.id) ?? null;
    const summary = (closure?.summary_data ?? {}) as SummaryData;
    const resolution = closure ? resolutionByClosure.get(closure.id) ?? null : null;
    const approval = closure ? approvalByClosure.get(closure.id) ?? null : null;
    const dispatch = closure ? dispatchByClosure.get(closure.id) ?? null : null;
    const report = closure ? reportByClosure.get(closure.id) ?? null : null;
    return {
      approval,
      closedAt: closure?.closed_at ?? period.closed_at,
      closureId: closure?.id ?? null,
      closureStatus: closure?.closure_status ?? null,
      commissionInCents: Number(closure?.commission_cents ?? 0),
      lifecycleStatus: period.lifecycle_status,
      modality: workspace?.modality ?? "real",
      month: period.period_month,
      owner: user?.display_name || user?.email || "Usuario sin nombre",
      periodId: period.id,
      positionDifferenceInCents: Number(summary.positionDifferenceInCents ?? 0),
      realizedDifferenceInCents: Number(summary.realizedReconciliationDifferenceInCents ?? 0),
      realizedGainInCents: Number(closure?.realized_gain_cents ?? 0),
      reason: closure?.reason ?? null,
      report,
      resolution,
      dispatch,
      scheduledCloseAt: period.scheduled_close_at,
      traderResultInCents: Number(closure?.trader_result_cents ?? 0),
      version: closure?.version ?? null,
    };
  });

  return {
    closedPeriods: periodRows.filter((period) => period.closureId).sort((left, right) =>
      right.scheduledCloseAt.localeCompare(left.scheduledCloseAt)),
    openPeriods: periodRows.filter((period) => period.lifecycleStatus === "open").sort((left, right) =>
      left.scheduledCloseAt.localeCompare(right.scheduledCloseAt)),
    runs: (runs.data ?? []).map((run) => ({
      closedPeriodCount: run.closed_period_count,
      completedAt: run.completed_at,
      duePeriodCount: run.due_period_count,
      failures: Array.isArray(run.failures) ? run.failures : [],
      id: run.id,
      startedAt: run.started_at,
      status: run.status,
      triggerSource: run.trigger_source,
    })),
  };
}

export type PeriodCloseControlData = Awaited<ReturnType<typeof loadPeriodCloseControl>>;

