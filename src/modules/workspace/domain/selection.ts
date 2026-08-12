export type WorkspaceModality = "real" | "practice";

export type WorkspaceOption = {
  id: string;
  modality: WorkspaceModality;
  periods: Array<{ id: string; periodMonth: string }>;
};

export type WorkspaceSelection = {
  workspace: WorkspaceOption;
  period: WorkspaceOption["periods"][number] | null;
};

export function resolveWorkspaceSelection(
  workspaces: WorkspaceOption[],
  requestedModality: string | undefined,
  requestedPeriod: string | undefined,
): WorkspaceSelection | null {
  if (workspaces.length === 0) {
    return null;
  }

  const ordered = [...workspaces].sort((left, right) => {
    if (left.modality === right.modality) return 0;
    return left.modality === "real" ? -1 : 1;
  });
  const workspace =
    ordered.find((option) => option.modality === requestedModality) ?? ordered[0];
  const periods = [...workspace.periods].sort((left, right) =>
    right.periodMonth.localeCompare(left.periodMonth),
  );
  const period =
    periods.find((option) => option.periodMonth === requestedPeriod) ??
    periods[0] ??
    null;

  return { workspace: { ...workspace, periods }, period };
}

export function formatPeriodLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);

  if (!year || !month || month < 1 || month > 12) {
    return periodMonth;
  }

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
