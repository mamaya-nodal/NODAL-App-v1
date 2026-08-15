import { describe, expect, it } from "vitest";
import { findAllocationComparisons, shouldEscalateToTerra, type DiagnosticAnswer, type DiagnosticFacts } from "./diagnostic-rules";

const answer: DiagnosticAnswer = {
  cause: "Registro distinto", confidence: "high", evidence: [], explainedDifferenceInCents: 1_800,
  needsEscalation: false, recommendedAction: "Revisar", simulationResultInCents: 0,
  status: "verified", summary: "Diferencia encontrada",
};

describe("diagnostic rules", () => {
  it("detecta una diferencia exacta entre Control Diario y Registro", () => {
    const comparisons = findAllocationComparisons({
      controls: [{ id: "control", number: 21, operatedOn: "2026-08-14", phase: "Primera vuelta" }],
      entries: [{ accountId: "account", controlId: "control", destination: "NETO BROKER +", magnitudeInCents: 52_060 }],
      labelsByAccountId: new Map([["account", "LUCID 6"]]),
      participants: [{ accountId: "account", allocatedInCents: 50_260, controlId: "control" }],
    });
    expect(comparisons).toEqual([{ accountLabel: "LUCID 6", allocatedInCents: 50_260, controlNumber: 21, differenceInCents: 1_800, entryInCents: 52_060, operatedOn: "2026-08-14", phase: "Primera vuelta" }]);
  });

  it("solo evita Terra cuando una conciliación queda demostrada matemáticamente", () => {
    const facts: DiagnosticFacts = {
      accountPhases: [], alertCode: "gain_reconciliation_difference", alertDifferenceInCents: 1_800,
      allocationComparisons: [], exactDifferenceMatches: [{ accountLabel: "LUCID 6", allocatedInCents: 50_260, controlNumber: 21, differenceInCents: 1_800, entryInCents: 52_060, operatedOn: "2026-08-14", phase: "Primera vuelta" }],
      recentActivity: [], summaryValues: {},
    };
    expect(shouldEscalateToTerra({ answer, facts })).toBe(false);
    expect(shouldEscalateToTerra({ answer: { ...answer, simulationResultInCents: 100 }, facts })).toBe(true);
  });
});
