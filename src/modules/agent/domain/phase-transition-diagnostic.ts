export type HistoricalLink = Readonly<{
  accountId: string;
  closedAt: string | null;
  closureReason: string | null;
  connectionName: string;
  connectorId: string;
  externalAccountName: string;
  firstSeenAt: string;
}>;

export type ClosedTechnicalSession = Readonly<{
  accountName: string;
  connectionName: string;
  connectorId: string;
  id: number;
  openedAt: string;
}>;

export type BlockedCoverageBatch = Readonly<{
  brokerSessionId: number;
  connectorId: string;
  id: string;
  openedAt: string;
}>;

export type PhaseTransitionDiagnostic = Readonly<{
  accountIds: readonly string[];
  batchId: string;
  sessionIds: readonly number[];
}>;

const WINDOW_MS = 2 * 60 * 1000;

function timestamp(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Finds a specific and reviewable race: an operation was observed while an old
 * account identifier was valid, then Ninja moved that account to Funded before
 * the broker batch was persisted. It deliberately proposes nothing; an
 * operator must still validate and repair the batch through the journal.
 */
export function findPhaseTransitionDiagnostics(
  batches: readonly BlockedCoverageBatch[],
  sessions: readonly ClosedTechnicalSession[],
  links: readonly HistoricalLink[],
): readonly PhaseTransitionDiagnostic[] {
  return batches.flatMap((batch) => {
    const batchOpenedAt = timestamp(batch.openedAt);
    if (batchOpenedAt === null) return [];
    const candidates = sessions.flatMap((session) => {
      if (session.connectorId !== batch.connectorId || session.id === batch.brokerSessionId) return [];
      const sessionOpenedAt = timestamp(session.openedAt);
      if (sessionOpenedAt === null || Math.abs(sessionOpenedAt - batchOpenedAt) > WINDOW_MS) return [];
      const matching = links.filter((link) => {
        if (
          link.connectorId !== session.connectorId ||
          link.connectionName !== session.connectionName ||
          link.externalAccountName !== session.accountName ||
          link.closureReason !== "phase_transition"
        ) return false;
        const firstSeenAt = timestamp(link.firstSeenAt);
        const closedAt = timestamp(link.closedAt);
        return firstSeenAt !== null && closedAt !== null && firstSeenAt <= sessionOpenedAt && sessionOpenedAt <= closedAt;
      });
      return matching.length === 1 ? [{ accountId: matching[0].accountId, sessionId: session.id }] : [];
    });
    const distinctAccounts = [...new Set(candidates.map((candidate) => candidate.accountId))];
    if (distinctAccounts.length === 0) return [];
    return [{
      accountIds: distinctAccounts,
      batchId: batch.id,
      sessionIds: candidates.map((candidate) => candidate.sessionId),
    }];
  });
}
