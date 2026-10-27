export type OpeningCutoffSource = Readonly<{
  created_at?: string | null;
  updated_at?: string | null;
}>;

export function openingCutoffTimestamp(opening: OpeningCutoffSource | null | undefined): string | null {
  if (!opening) return null;
  const candidate = opening.updated_at ?? opening.created_at ?? null;
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

export function happenedAfterOpening<T extends Readonly<{ opened_at: string }>>(
  rows: readonly T[],
  cutoffAt: string | null | undefined,
): T[] {
  if (!cutoffAt) return [...rows];
  const cutoff = Date.parse(cutoffAt);
  if (!Number.isFinite(cutoff)) return [...rows];
  return rows.filter((row) => {
    const openedAt = Date.parse(row.opened_at);
    return !Number.isFinite(openedAt) || openedAt >= cutoff;
  });
}

export function observedAfterOpening<T extends Readonly<{ occurred_at: string }>>(
  rows: readonly T[],
  cutoffAt: string | null | undefined,
): T[] {
  if (!cutoffAt) return [...rows];
  const cutoff = Date.parse(cutoffAt);
  if (!Number.isFinite(cutoff)) return [...rows];
  return rows.filter((row) => {
    const occurredAt = Date.parse(row.occurred_at);
    return !Number.isFinite(occurredAt) || occurredAt >= cutoff;
  });
}
