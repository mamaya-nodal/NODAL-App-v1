import { describe, expect, it } from "vitest";
import { resolveNinjaAccountingPhase } from "./accounting-phase";

const base = { detectedPhase: "Funded" as const, openedAt: "2026-09-29T15:49:37Z", fundedStartedAt: "2026-09-28T16:07:09Z", entries: [{ phase: "Evaluacion" as const, occurredAt: "2026-09-28T15:00:00Z" }] };
describe("accounting phase at operation time", () => {
  it("starts the first funded trade in Primera vuelta after a confirmed transition", () => {
    expect(resolveNinjaAccountingPhase(base)).toBe("Primera vuelta");
  });
  it("never relabels evaluation trades with today's funded state", () => {
    expect(resolveNinjaAccountingPhase({ ...base, detectedPhase: "Evaluation" })).toBe("Evaluacion");
  });
  it("does not infer the round of an imported funded account with unknown history", () => {
    expect(resolveNinjaAccountingPhase({ ...base, fundedStartedAt: null })).toBeNull();
  });
  it("ignores future transitions and future recorded phases", () => {
    expect(resolveNinjaAccountingPhase({ ...base, openedAt: "2026-09-27T10:00:00Z", entries: [{ phase: "Primera vuelta", occurredAt: "2026-09-29T10:00:00Z" }] })).toBeNull();
  });
  it("preserves an established subsequent round", () => {
    expect(resolveNinjaAccountingPhase({ ...base, entries: [{ phase: "Segunda vuelta", occurredAt: "2026-09-29T10:00:00Z" }] })).toBe("Segunda vuelta");
  });
  it("does not assign a phase when the account type is unknown", () => {
    expect(resolveNinjaAccountingPhase({ ...base, detectedPhase: null })).toBeNull();
  });
});
