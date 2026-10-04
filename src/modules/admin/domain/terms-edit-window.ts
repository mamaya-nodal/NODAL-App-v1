const TERMS_EDIT_WINDOW_MS = 48 * 60 * 60 * 1_000;

export function canEditDeskTerms(input: Readonly<{
  actorIsMaster: boolean;
  previousPeriodClosedAt: string | null;
  now: Date;
  targetIsNewUser: boolean;
}>): boolean {
  if (input.actorIsMaster || input.targetIsNewUser) return true;
  if (!input.previousPeriodClosedAt) return false;

  const closedAt = new Date(input.previousPeriodClosedAt).getTime();
  if (!Number.isFinite(closedAt)) return false;

  const elapsed = input.now.getTime() - closedAt;
  return elapsed >= 0 && elapsed < TERMS_EDIT_WINDOW_MS;
}

