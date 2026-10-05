import { describe, it, expect } from "vitest";
import {
  calculateDeskOverview,
  latestTerms,
  ROOT_DESK,
  type Person,
} from "./desks";
describe("desk accounting", () => {
  it("preserves earlier membership and commission", () => {
    const rows = [
      { user_id: "a", effective_month: "2026-09-01", desk_id: "old" },
      { user_id: "a", effective_month: "2026-10-01", desk_id: "new" },
    ];
    expect(latestTerms(rows, "2026-09-01", (x) => x.user_id)[0].desk_id).toBe(
      "old",
    );
  });
  it("keeps administrators in their origin desk without an automatic referral bonus", () => {
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
    expect(carlos.totalIncome).toBe(2117500);
    expect(result.gross).toBe(7000000);
    expect(
      result.nodalIncome + result.people.reduce((s, p) => s + p.totalIncome, 0),
    ).toBe(result.gross);
  });

  it("distributes nested administration in cascade without recomputing the original billing", () => {
    const desks = [
      { id: ROOT_DESK, name: "NODAL", parent_id: null, created_at: "" },
      { id: "alfred", name: "Mesa Alfred", parent_id: ROOT_DESK, created_at: "" },
      { id: "juana", name: "Mesa Juana", parent_id: "alfred", created_at: "" },
    ];
    const deskTerms = [
      { active: true, desk_id: ROOT_DESK, effective_month: "2026-10-01", manager_id: null, nodal_bps: 10_000 },
      { active: true, desk_id: "alfred", effective_month: "2026-10-01", manager_id: "a", nodal_bps: 2_500 },
      { active: true, desk_id: "juana", effective_month: "2026-10-01", manager_id: "j", nodal_bps: 5_000 },
    ];
    const people: Person[] = [
      { access: "active", email: "a@test", gross: 0, id: "a", legacyCommission: 0, master: false, name: "Alfred" },
      { access: "active", email: "j@test", gross: 0, id: "j", legacyCommission: 0, master: false, name: "Juana" },
      { access: "active", email: "x@test", gross: 10_000, id: "x", legacyCommission: 0, master: false, name: "Javier" },
    ];
    const userTerms = [
      { bonus_enabled: false, commission_bps: 0, desk_id: ROOT_DESK, effective_month: "2026-10-01", level: 2, state: "active", user_id: "a" },
      { bonus_enabled: false, commission_bps: 0, desk_id: "alfred", effective_month: "2026-10-01", level: 2, state: "active", user_id: "j" },
      { bonus_enabled: false, commission_bps: 5_000, desk_id: "juana", effective_month: "2026-10-01", level: 1, state: "active", user_id: "x" },
    ];
    const result = calculateDeskOverview(desks, deskTerms, people, userTerms, "2026-10-01");
    const alfred = result.people.find((person) => person.id === "a")!;
    const juana = result.people.find((person) => person.id === "j")!;
    expect(juana.mesaIncome).toBe(2_500);
    expect(alfred.mesaIncome).toBe(1_875);
    expect(result.nodalIncome).toBe(625);
    expect(result.nodalIncome + result.people.reduce((sum, person) => sum + person.totalIncome, 0)).toBe(10_000);
  });
});
