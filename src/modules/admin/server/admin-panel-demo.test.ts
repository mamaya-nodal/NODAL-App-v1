import { describe, expect, it } from "vitest";

import { buildAdminPanelDemo } from "./admin-panel-demo";

describe("admin panel demo", () => {
  it("builds a nested and economically conserved fictitious structure", () => {
    const data = buildAdminPanelDemo();
    const root = data.overview.desks.find((desk) => desk.id === data.deskId)!;
    expect(data.demo).toBe(true);
    expect(data.preview).toBe(false);
    expect(data.overview.people).toHaveLength(7);
    expect(data.overview.desks).toHaveLength(3);
    expect(root.structureMembers).toHaveLength(6);
    expect(data.history).toHaveLength(3);
    expect(data.overview.people.filter((person) => person.mesaIncome > 0)).toHaveLength(3);
    expect(data.overview.people.every((person) => person.email.endsWith("@nodal.test"))).toBe(true);
  });
});
