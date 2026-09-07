import { describe, it, expect } from "vitest";
import {
  bonusBps,
  calculateDeskOverview,
  latestTerms,
  ROOT_DESK,
  type Person,
} from "./desks";
describe("desk accounting", () => {
  it("uses replacement thresholds, not additive bonuses", () =>
    expect([0, 1, 2, 3, 4, 5, 9, 10].map(bonusBps)).toEqual([
      0, 1500, 1500, 3000, 3000, 4000, 4000, 5000,
    ]));
  it("preserves earlier membership and commission", () => {
    const rows = [
      { user_id: "a", effective_month: "2026-09-01", desk_id: "old" },
      { user_id: "a", effective_month: "2026-10-01", desk_id: "new" },
    ];
    expect(latestTerms(rows, "2026-09-01", (x) => x.user_id)[0].desk_id).toBe(
      "old",
    );
  });
  it("pays bonus only from direct child NODAL share and keeps administrators in origin desk", () => {
    const desks = [
      { id: ROOT_DESK, name: "Nodal", parent_id: null, created_at: "" },
      { id: "c", name: "Carlos", parent_id: ROOT_DESK, created_at: "" },
      { id: "p", name: "Pepito", parent_id: "c", created_at: "" },
    ];
    const dt = desks.map((d) => ({
      desk_id: d.id,
      effective_month: "2026-09-01",
      manager_id: d.id === "c" ? "carlos" : d.id === "p" ? "pepito" : null,
      nodal_bps: d.id === ROOT_DESK ? 10000 : d.id === "c" ? 3000 : 3500,
      active: true,
    }));
    const people: Person[] = [
      "carlos",
      "pepito",
      "juan",
      "pedro",
      "a",
      "b",
      "z",
    ].map((id) => ({
      id,
      name: id,
      email: "",
      access: "active",
      master: false,
      gross: 1_000_000,
      legacyCommission: 0,
    }));
    const ut = people.map((p) => ({
      user_id: p.id,
      effective_month: "2026-09-01",
      desk_id:
        p.id === "carlos"
          ? ROOT_DESK
          : ["pepito", "juan", "pedro"].includes(p.id)
            ? "c"
            : "p",
      level: 2,
      state: "active",
      commission_bps: p.id === "carlos" ? 3000 : 5000,
      bonus_enabled: true,
    }));
    const result = calculateDeskOverview(desks, dt, people, ut, "2026-09-01");
    const carlos = result.people.find((p) => p.id === "carlos")!;
    expect(carlos.deskId).toBe(ROOT_DESK);
    expect(carlos.bonus).toBe(78750);
    expect(carlos.totalIncome).toBe(1828750);
    expect(result.gross).toBe(7000000);
    expect(
      result.nodalIncome + result.people.reduce((s, p) => s + p.totalIncome, 0),
    ).toBe(result.gross);
  });
});
