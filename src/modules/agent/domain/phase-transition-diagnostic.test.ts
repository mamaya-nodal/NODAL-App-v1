import { describe, expect, it } from "vitest";
import { findPhaseTransitionDiagnostics } from "./phase-transition-diagnostic";

describe("phase transition reconciliation diagnostic", () => {
  it("finds prop sessions that were valid before a later evaluation-to-funded transition", () => {
    const diagnostics = findPhaseTransitionDiagnostics(
      [{ id: "batch", connectorId: "connector", brokerSessionId: 10, openedAt: "2026-10-30T15:00:09.000Z" }],
      [
        { id: 10, connectorId: "connector", connectionName: "Live", accountName: "2234971", openedAt: "2026-10-30T15:00:09.000Z" },
        { id: 11, connectorId: "connector", connectionName: "Lucid", accountName: "LFE016", openedAt: "2026-10-30T14:59:31.000Z" },
        { id: 12, connectorId: "connector", connectionName: "Lucid", accountName: "LFE017", openedAt: "2026-10-30T14:59:31.000Z" },
      ],
      [
        { accountId: "a16", connectorId: "connector", connectionName: "Lucid", externalAccountName: "LFE016", firstSeenAt: "2026-10-29T14:00:00.000Z", closedAt: "2026-10-30T15:16:20.000Z", closureReason: "phase_transition" },
        { accountId: "a17", connectorId: "connector", connectionName: "Lucid", externalAccountName: "LFE017", firstSeenAt: "2026-10-29T14:00:00.000Z", closedAt: "2026-10-30T15:16:20.000Z", closureReason: "phase_transition" },
      ],
    );

    expect(diagnostics).toEqual([{ batchId: "batch", accountIds: ["a16", "a17"], sessionIds: [11, 12] }]);
  });

  it("does not report a transition when the session happened after its old link closed", () => {
    expect(findPhaseTransitionDiagnostics(
      [{ id: "batch", connectorId: "connector", brokerSessionId: 10, openedAt: "2026-10-30T15:20:00.000Z" }],
      [
        { id: 10, connectorId: "connector", connectionName: "Live", accountName: "2234971", openedAt: "2026-10-30T15:20:00.000Z" },
        { id: 11, connectorId: "connector", connectionName: "Lucid", accountName: "LFE016", openedAt: "2026-10-30T15:19:30.000Z" },
      ],
      [{ accountId: "a16", connectorId: "connector", connectionName: "Lucid", externalAccountName: "LFE016", firstSeenAt: "2026-10-29T14:00:00.000Z", closedAt: "2026-10-30T15:16:20.000Z", closureReason: "phase_transition" }],
    )).toEqual([]);
  });
});
