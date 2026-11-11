export type HistoricalIdentityAssignment = Readonly<{
  assignedAt: string;
  identityId: string;
  unassignedAt: string | null;
}>;

const ARGENTINA_UTC_OFFSET_HOURS = 3;

function operationalDayBounds(operatedOn: string) {
  const [year, month, day] = operatedOn.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day, ARGENTINA_UTC_OFFSET_HOURS);
  return { end: start + 24 * 60 * 60 * 1000, start };
}

export function identityAssignmentOnOperationalDay(
  assignments: readonly HistoricalIdentityAssignment[],
  operatedOn: string | null | undefined,
): HistoricalIdentityAssignment | null {
  if (!operatedOn) return null;
  const { end, start } = operationalDayBounds(operatedOn);
  return assignments
    .filter((assignment) => {
      const assignedAt = Date.parse(assignment.assignedAt);
      const unassignedAt = assignment.unassignedAt ? Date.parse(assignment.unassignedAt) : null;
      return assignedAt < end && (unassignedAt === null || unassignedAt >= start);
    })
    .sort((left, right) => Date.parse(right.assignedAt) - Date.parse(left.assignedAt))[0] ?? null;
}
