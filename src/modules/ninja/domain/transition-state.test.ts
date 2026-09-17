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

  it("marca la quema al tocar el piso aunque la cuenta siga conectada", () => {
    sequence = 0;
    const first = evolveNinjaTransitionState({ businessDate: "2026-09-11", connectedNames: ["Tradeify"], createLifeId: id, observations: [{ ...observation("TDFY1", "Evaluation"), connectionName: "Tradeify" }], state: { lives: [] } });
    const burned = evolveNinjaTransitionState({ businessDate: "2026-09-11", connectedNames: ["Tradeify"], createLifeId: id, observations: [{ ...observation("TDFY1", "Evaluation", 47_747.72), connectionName: "Tradeify" }], state: first.state });

    expect(burned.changes).toMatchObject([{
      automatic: true,
      fromAccountName: "TDFY1",
      kind: "burned",
      toAccountName: null,
    }]);
    expect(burned.state.lives).toMatchObject([{ status: "burned", tracked: { balanceInCents: 4_774_772 } }]);

    const repeated = evolveNinjaTransitionState({ businessDate: "2026-09-11", connectedNames: ["Tradeify"], createLifeId: id, observations: [{ ...observation("TDFY1", "Evaluation", 47_747.72), connectionName: "Tradeify" }], state: burned.state });
    expect(repeated.changes).toHaveLength(0);
  });

  it("revierte una quema automática si Ninja vuelve a mostrar la misma cuenta activa sobre el piso", () => {
    sequence = 0;
    const first = evolveNinjaTransitionState({ businessDate: "2026-09-17", connectedNames: ["Tradeify"], createLifeId: id,
      observations: [{ ...observation("FTDFYSLX1", "Funded"), companyCode: "TRADEFY", connectionName: "Tradeify", product: "Select Flex" }], state: { lives: [] } });
    const raisedFloor = evolveNinjaTransitionState({ businessDate: "2026-09-17", connectedNames: ["Tradeify"], createLifeId: id,
      observations: [{ ...observation("FTDFYSLX1", "Funded", 52_100), companyCode: "TRADEFY", connectionName: "Tradeify", product: "Select Flex" }], state: first.state });
    const burned = evolveNinjaTransitionState({ businessDate: "2026-09-17", connectedNames: ["Tradeify"], createLifeId: id,
      observations: [{ ...observation("FTDFYSLX1", "Funded", 49_774.24), companyCode: "TRADEFY", connectionName: "Tradeify", product: "Select Flex" }], state: raisedFloor.state });
    const recovered = evolveNinjaTransitionState({ businessDate: "2026-09-17", connectedNames: ["Tradeify"], createLifeId: id,
      observations: [{ ...observation("FTDFYSLX1", "Funded", 53_838.48), companyCode: "TRADEFY", connectionName: "Tradeify", product: "Select Flex" }], state: burned.state });

    expect(recovered.changes).toMatchObject([{
      automatic: true,
      fromAccountName: "FTDFYSLX1",
      kind: "burn_reversed",
    }]);
    expect(recovered.state.lives).toMatchObject([{
      status: "active",
      tracked: { balanceInCents: 5_383_848, externalAccountName: "FTDFYSLX1" },
    }]);
  });
});
