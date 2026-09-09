import { describe, expect, it } from "vitest";
import { evolveNinjaTransitionState, type NinjaTransitionObservation } from "./transition-state";

let sequence = 0;
const id = () => `life-${++sequence}`;
function observation(name: string, phase: NinjaTransitionObservation["phase"], balance = 50_000): NinjaTransitionObservation {
  return { accountSizeInCents: 5_000_000, balanceInCents: balance * 100, balanceStatus: "verified", companyCode: "LUCID", connectionName: "Lucid", externalAccountName: name, phase, product: "Flex" };
}

describe("evolveNinjaTransitionState", () => {
  it("conserva estado entre inventarios y no repite alertas de una desaparición", () => {
    sequence = 0;
    const first = evolveNinjaTransitionState({ businessDate: "2026-08-24", connectedNames: ["Lucid"], createLifeId: id, observations: [observation("LFE1", "Evaluation")], state: { lives: [] } });
    expect(first.changes[0].kind).toBe("new_account");
    const missing = evolveNinjaTransitionState({ businessDate: "2026-08-24", connectedNames: ["Lucid"], createLifeId: id, observations: [], state: first.state });
    expect(missing.changes[0].kind).toBe("review_disappearance");
    const repeated = evolveNinjaTransitionState({ businessDate: "2026-08-24", connectedNames: ["Lucid"], createLifeId: id, observations: [], state: missing.state });
    expect(repeated.changes).toHaveLength(0);
  });

  it("reutiliza una vida desaparecida cuando aparece su funded", () => {
    sequence = 0;
    let current = evolveNinjaTransitionState({ businessDate: "2026-08-24", connectedNames: ["Lucid"], createLifeId: id, observations: [observation("LFE1", "Evaluation", 53_001)], state: { lives: [] } }).state;
    current = evolveNinjaTransitionState({ businessDate: "2026-08-24", connectedNames: ["Lucid"], createLifeId: id, observations: [], state: current }).state;
    const funded = evolveNinjaTransitionState({ businessDate: "2026-08-24", connectedNames: ["Lucid"], createLifeId: id, observations: [observation("LFF1", "Funded")], state: current });
    expect(funded.changes).toMatchObject([{ kind: "evaluation_to_funded", automatic: true }]);
    expect(funded.state.lives).toMatchObject([{ status: "active", tracked: { externalAccountName: "LFF1" } }]);
  });
});
