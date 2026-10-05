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
    expect(data.overview.desks.map((desk) => desk.name)).toEqual([
      "MESA DE MAURICIO",
      "MESA DE SOFÍA",
      "MESA DE DIEGO",
    ]);
    expect(root.structureMembers).toHaveLength(6);
    expect(data.history).toHaveLength(3);
    expect(data.deskName).toBe("MESA DE MAURICIO");
    expect(new Set(Object.values(data.displayIdByUser)).size).toBe(7);
    expect(Object.values(data.displayIdByUser).every((id) => id.startsWith("USERND-M"))).toBe(true);
    expect(data.displayIdByUser["demo-mauricio"]).toBe("USERND-MP-01");
    expect(data.displayIdByUser["demo-sofia"]).toBe("USERND-MP-03");
    expect(data.displayIdByUser["demo-diego"]).toBe("USERND-M01-02");
    expect(data.displayIdByUser["demo-camila"]).toBe("USERND-M02-01");
    expect(data.detailByUser["demo-laura"].identities).toHaveLength(2);
    expect(data.detailByUser["demo-sofia"].performance).toHaveLength(3);
    expect(data.overview.people.filter((person) => person.mesaIncome > 0)).toHaveLength(3);
    expect(data.overview.people.every((person) => person.email.endsWith("@nodal.test"))).toBe(true);
  });
});
