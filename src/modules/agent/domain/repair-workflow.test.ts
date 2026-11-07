import { describe, expect, it } from "vitest";
import { assessRepair, assertFreshRepair, assertRepairTransition, incidentKinds, incidentRequirements, type RepairDraft } from "./repair-workflow";

const draft: RepairDraft = {
  incident: "purchase_origin", action: "purchase_origin", missing: [], description: "Origen de compra",
  evidence: { ownerId: "lore", periodId: "period", identityId: "gino", fingerprint: "v1", sourceIds: ["purchase"], periodOpen: true, complete: true, ambiguous: false, hasSubsequentActivity: false, reconstructionVerified: false, invariants: [{ name: "Capital conciliado", passed: true }] },
};
describe("Nodalito common repair policy", () => {
  it("covers the incident families from trader history", () => {
    expect(incidentKinds).toHaveLength(11);
    for (const kind of incidentKinds) expect(incidentRequirements[kind].length).toBeGreaterThan(1);
  });
  it("allows a fully evidenced repair", () => expect(assessRepair(draft, "lore").state).toBe("ready"));
  it("never authorizes another trader's data", () => expect(assessRepair(draft, "david").state).toBe("needs_review"));
  it("asks for missing facts instead of inventing them", () => expect(assessRepair({ ...draft, missing: ["Comisión"] }, "lore")).toEqual({ state: "needs_information", reasons: ["Comisión"] }));
  it.each([
    { periodOpen: false }, { ambiguous: true }, { complete: false }, { sourceIds: [] }, { invariants: [] },
    { invariants: [{ name: "Distribución diferente al resultado", passed: false }] },
    { hasSubsequentActivity: true, reconstructionVerified: false },
  ])("blocks unsafe evidence %j", (change) => expect(assessRepair({ ...draft, evidence: { ...draft.evidence, ...change } }, "lore").state).not.toBe("ready"));
  it("permits subsequent activity only after verified reconstruction", () => expect(assessRepair({ ...draft, evidence: { ...draft.evidence, hasSubsequentActivity: true, reconstructionVerified: true } }, "lore").state).toBe("ready"));
  it("does not claim unsupported recovery is automatic", () => expect(assessRepair({ ...draft, action: null }, "lore").state).toBe("needs_review"));
  it("rejects stale previews", () => expect(() => assertFreshRepair("old", "new")).toThrow("repair_snapshot_changed"));
  it("cannot apply twice or report success before executing", () => {
    expect(() => assertRepairTransition("applied", "applying")).toThrow();
    expect(() => assertRepairTransition("ready", "applied")).toThrow();
    expect(() => assertRepairTransition("applying", "applied")).not.toThrow();
  });
});
