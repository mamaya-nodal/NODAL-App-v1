import { describe, expect, it } from "vitest";

import { buildMasterControlDemo } from "./master-control-demo";

describe("Admin Master design demo", () => {
  it("builds an isolated, navigable system scenario", () => {
    const data = buildMasterControlDemo();
    expect(data.demo).toBe(true);
    expect(data.pendingAccessCount).toBe(4);
    expect(data.units).toHaveLength(1);
    expect(data.overview.people).toHaveLength(7);
    expect(data.overview.desks).toHaveLength(3);
    expect(data.performanceHistory).toHaveLength(3);
    expect(Object.keys(data.identifiersByUser)).toHaveLength(7);
    expect(Object.values(data.identitiesByUser).flat().length).toBeGreaterThan(0);
    expect(data.overview.people.every((person) => person.email.endsWith("@nodal.test"))).toBe(true);
  });
});
