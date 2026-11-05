import { describe, expect, it } from "vitest";

import { answerDeterministicAudit, buildDeterministicAudit, type NodalitoAuditSnapshot } from "./deterministic-audit";

const snapshot: NodalitoAuditSnapshot = {
  auditDate: "2026-11-05",
  currentPeriod: "2026-10-16",
  historicalGrossInCents: 50_000,
  systemGrossInCents: 20_000,
  yesterday: "2026-11-04",
  users: [{
    activeAccountCount: 5,
    connectorLight: "orange",
    connectorMessage: "Se perdió la señal mientras había una operación abierta.",
    currentGrossInCents: 20_000,
    email: "trader@example.com",
    excludedFromReporting: false,
    historicalGrossInCents: 50_000,
    id: "user-1",
    lastOperatedOn: "2026-11-04",
    name: "Trader Uno",
    pendingPayouts: [{ amountInCents: 10_000, approvedOn: "2026-11-04", id: "payout-1" }],
    reconciliationAlerts: [{ amountInCents: -5_000, id: "batch-1", occurredAt: "2026-11-04", reason: "Cuenta sin etapa" }],
  }],
};

describe("auditoría determinística de Nodalito", () => {
  it("detecta conciliaciones, conectores y payouts sin IA", () => {
    const audit = buildDeterministicAudit(snapshot);
    expect(audit.findings.map((finding) => finding.category)).toEqual(["reconciliation", "connector", "payout"]);
    expect(audit.operatedYesterday).toHaveLength(1);
  });

  it("responde preguntas de actividad con evidencia del día anterior", () => {
    const answer = answerDeterministicAudit("¿Quién operó ayer?", buildDeterministicAudit(snapshot), "2026-11-05T12:00:00Z");
    expect(answer.summary).toContain("Trader Uno");
  });

  it("comprueba que el total oficial sea la suma de usuarios incluidos", () => {
    const audit = buildDeterministicAudit({ ...snapshot, systemGrossInCents: 25_000 });
    expect(audit.findings[0]?.id).toBe("system-billing-mismatch");
  });
});
