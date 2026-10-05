import { describe, expect, it } from "vitest";

import { buildMasterControlDemo } from "./master-control-demo";

describe("Admin Master design demo", () => {
  it("builds an isolated, navigable system scenario", () => {
    const data = buildMasterControlDemo();
    expect(data.demo).toBe(true);
    expect(data.pendingAccessCount).toBe(6);
    expect(data.units).toHaveLength(4);
    expect(data.overview.people).toHaveLength(21);
    expect(data.overview.desks).toHaveLength(10);
    expect(data.unitSummaries).toHaveLength(4);
    expect(data.performanceHistory).toHaveLength(3);
    expect(Object.keys(data.identifiersByUser)).toHaveLength(21);
    expect(Object.values(data.identitiesByUser).flat().length).toBeGreaterThan(0);
    expect(data.overview.people.every((person) => person.email.endsWith("@nodal.test"))).toBe(true);
    expect(data.identifiersByUser["demo-mauricio"]).toBe("USERND-MP-01");
    expect(data.identifiersByUser["demo-elena"]).toBe("USERHW-MP-01");
    expect(data.identifiersByUser["demo-paula"]).toBe("USERAT-M01-01");
    expect(data.identifiersByUser["demo-ivan"]).toBe("USERAP-M01-01");
    expect(new Set(Object.values(data.unitByUser))).toEqual(new Set(data.units.map((unit) => unit.id)));
    expect(data.unitSummaries.reduce((sum, unit) => sum + unit.gross, 0)).toBe(data.overview.gross);
    expect(data.unitSummaries.reduce((sum, unit) => sum + unit.nodalIncome, 0)).toBe(data.overview.nodalIncome);
    expect(data.overview.desks.filter((desk) => desk.terms.manager_id !== null)).toHaveLength(6);
  });
});
