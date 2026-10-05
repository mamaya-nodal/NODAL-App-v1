const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function transmittedWithinLast24Hours(lastSeenAt: string | null, now: Date = new Date()) {
  if (!lastSeenAt) return false;
  const elapsed = now.getTime() - Date.parse(lastSeenAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= DAY_IN_MILLISECONDS;
}
