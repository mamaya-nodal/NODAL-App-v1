import { describe, expect, it } from "vitest";

import {
  calculateDeskOverview,
  ROOT_DESK,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "@/modules/admin/domain/desks";

import { buildPersonalDeskDashboard } from "./personal-desk-dashboard";

const desks: Desk[] = [
  { created_at: "", id: ROOT_DESK, name: "NODAL", parent_id: null },
  { created_at: "", id: "c", name: "Carlos", parent_id: ROOT_DESK },
  { created_at: "", id: "p", name: "Pepito", parent_id: "c" },
];
const deskTerms: DeskTerms[] = desks.map((desk) => ({
  active: true,
  desk_id: desk.id,
  effective_month: "2026-01-01",
  manager_id: desk.id === "c" ? "carlos" : desk.id === "p" ? "pepito" : null,
  nodal_bps: desk.id === ROOT_DESK ? 10_000 : desk.id === "c" ? 3_000 : 3_500,
}));
const userTerms: UserTerms[] = ["carlos", "pepito", "juan", "zeta"].map((userId) => ({
  bonus_enabled: true,
  commission_bps: userId === "carlos" ? 3_000 : 5_000,
  desk_id: userId === "carlos" ? ROOT_DESK : userId === "zeta" ? "p" : "c",
  effective_month: "2026-01-01",
  level: userId === "carlos" ? 2 : 1,
  state: "active",
  user_id: userId,
}));

function snapshot(month: string, grossByUser: Record<string, number>) {
  const people: Person[] = Object.entries(grossByUser).map(([id, gross]) => ({
    access: "active",
    email: `${id}@nodal.test`,
    gross,
    id,
    legacyCommission: 0,
    master: false,
    name: id,
  }));
  return {
    month,
    overview: calculateDeskOverview(desks, deskTerms, people, userTerms, month),
  };
}

describe("personal dashboard with desk economics", () => {
  it("combines own income and desk administration without an automatic bonus", () => {
    const dashboard = buildPersonalDeskDashboard({
      currentMonth: "2026-08-01",
      snapshots: [
        snapshot("2026-07-01", { carlos: 800_000, juan: 1_000_000, pepito: 1_000_000, zeta: 1_000_000 }),
        snapshot("2026-08-01", { carlos: 1_000_000, juan: 1_000_000, pepito: 1_000_000, zeta: 1_000_000 }),
      ],
      userId: "carlos",
    });

    expect(dashboard).not.toBeNull();
    expect(dashboard?.billingInCents).toBe(1_000_000);
    expect(dashboard?.earnings).toEqual({
      deskAdministrationInCents: 822_500,
      level: 2,
      ownOperationsInCents: 700_000,
      totalInCents: 1_522_500,
    });
    expect(dashboard?.capabilities).toEqual({
      managedDesk: { billingInCents: 2_000_000, capacity: 10, users: 2 },
    });
    expect(dashboard?.history).toHaveLength(2);
    expect(dashboard?.history.at(-1)?.earningsInCents).toBe(1_522_500);
  });

  it("hides desk concepts from a user who does not receive them", () => {
    const dashboard = buildPersonalDeskDashboard({
      currentMonth: "2026-08-01",
      snapshots: [snapshot("2026-08-01", { carlos: 1_000_000, juan: 1_000_000, pepito: 1_000_000, zeta: 1_000_000 })],
      userId: "juan",
    });

    expect(dashboard?.capabilities).toBeUndefined();
    expect(dashboard?.earnings.deskAdministrationInCents).toBeNull();
  });
});
