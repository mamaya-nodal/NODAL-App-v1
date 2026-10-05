import {
  calculateDeskOverview,
  ROOT_DESK,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "../domain/desks";
import type { MyDeskPanelData } from "./load-my-desk";

const USER = {
  camila: "demo-camila",
  diego: "demo-diego",
  laura: "demo-laura",
  mauricio: "demo-mauricio",
  nicolas: "demo-nicolas",
  pablo: "demo-pablo",
  sofia: "demo-sofia",
} as const;

const DESK = {
  root: "demo-mesa-mauricio",
  growth: "demo-mesa-crecimiento",
  south: "demo-mesa-sur",
} as const;

const months = ["2026-08-01", "2026-09-01", "2026-10-01"] as const;

const desks: Desk[] = [
  { created_at: "2026-08-01T12:00:00Z", id: DESK.root, name: "Mesa de prueba Mauricio", parent_id: ROOT_DESK },
  { created_at: "2026-08-05T12:00:00Z", id: DESK.growth, name: "Mesa Crecimiento", parent_id: DESK.root },
  { created_at: "2026-08-10T12:00:00Z", id: DESK.south, name: "Mesa Sur", parent_id: DESK.growth },
];

const deskTerms: DeskTerms[] = [
  { active: true, desk_id: DESK.root, effective_month: months[0], manager_id: USER.mauricio, nodal_bps: 2_500 },
  { active: true, desk_id: DESK.growth, effective_month: months[0], manager_id: USER.sofia, nodal_bps: 4_000 },
  { active: true, desk_id: DESK.south, effective_month: months[0], manager_id: USER.diego, nodal_bps: 5_000 },
];

const userTerms: UserTerms[] = [
  { bonus_enabled: false, commission_bps: 4_000, desk_id: ROOT_DESK, effective_month: months[0], level: 2, state: "active", user_id: USER.mauricio },
  { bonus_enabled: false, commission_bps: 5_000, desk_id: DESK.root, effective_month: months[0], level: 1, state: "active", user_id: USER.laura },
  { bonus_enabled: false, commission_bps: 4_500, desk_id: DESK.root, effective_month: months[0], level: 2, state: "active", user_id: USER.sofia },
  { bonus_enabled: false, commission_bps: 5_000, desk_id: DESK.growth, effective_month: months[0], level: 1, state: "active", user_id: USER.pablo },
  { bonus_enabled: false, commission_bps: 3_500, desk_id: DESK.growth, effective_month: months[0], level: 2, state: "active", user_id: USER.diego },
  { bonus_enabled: false, commission_bps: 5_500, desk_id: DESK.south, effective_month: months[0], level: 1, state: "paused", user_id: USER.camila },
  { bonus_enabled: false, commission_bps: 4_000, desk_id: DESK.south, effective_month: months[0], level: 1, state: "active", user_id: USER.nicolas },
];

const peopleData = [
  [USER.mauricio, "Mauricio Amaya", "mauricio.prueba@nodal.test", true],
  [USER.laura, "Laura Méndez", "laura.prueba@nodal.test", false],
  [USER.sofia, "Sofía Torres", "sofia.prueba@nodal.test", false],
  [USER.pablo, "Pablo Ríos", "pablo.prueba@nodal.test", false],
  [USER.diego, "Diego Luna", "diego.prueba@nodal.test", false],
  [USER.camila, "Camila Paz", "camila.prueba@nodal.test", false],
  [USER.nicolas, "Nicolás Vera", "nicolas.prueba@nodal.test", false],
] as const;

const grossByMonth: Record<string, Record<string, number>> = {
  "2026-08-01": {
    [USER.mauricio]: 820_000, [USER.laura]: 430_000, [USER.sofia]: 760_000,
    [USER.pablo]: 510_000, [USER.diego]: 690_000, [USER.camila]: 280_000, [USER.nicolas]: 390_000,
  },
  "2026-09-01": {
    [USER.mauricio]: 1_050_000, [USER.laura]: 620_000, [USER.sofia]: 880_000,
    [USER.pablo]: 540_000, [USER.diego]: 730_000, [USER.camila]: 360_000, [USER.nicolas]: 470_000,
  },
  "2026-10-01": {
    [USER.mauricio]: 1_200_000, [USER.laura]: 710_000, [USER.sofia]: 930_000,
    [USER.pablo]: 640_000, [USER.diego]: 810_000, [USER.camila]: 420_000, [USER.nicolas]: 520_000,
  },
};

function overview(month: string) {
  const people: Person[] = peopleData.map(([id, name, email, master]) => ({
    access: "active",
    email,
    gross: grossByMonth[month][id] ?? 0,
    id,
    legacyCommission: 0,
    master,
    name,
  }));
  return calculateDeskOverview(desks, deskTerms, people, userTerms, month);
}

export function buildAdminPanelDemo(): MyDeskPanelData {
  const snapshots = months.map((month) => ({ month, overview: overview(month) }));
  const current = snapshots.at(-1)!;
  const profilesByUser = Object.fromEntries(peopleData.map(([id, name, email, master], index) => [id, {
    access_role: master ? ("admin" as const) : ("student" as const),
    access_state: "active",
    created_at: `2026-08-${String(index + 2).padStart(2, "0")}T12:00:00Z`,
    display_name: name,
    email,
    id,
  }]));
  const historicalBillingByUser = Object.fromEntries(peopleData.map(([id]) => [id,
    months.reduce((total, month) => total + (grossByMonth[month][id] ?? 0), 0),
  ]));
  const priorPeriodGrossByUser = Object.fromEntries(peopleData.map(([id]) => [id, grossByMonth[months[1]][id] ?? 0]));
  const summaries = Object.fromEntries(peopleData.map(([id]) => [id, null]));
  const suggestions = Object.fromEntries(peopleData.map(([id]) => [id, null]));

  return {
    connectorByUser: {
      [USER.mauricio]: { online: true, version: "0.10" },
      [USER.laura]: { online: true, version: "0.10" },
      [USER.sofia]: { online: false, version: "0.9" },
      [USER.pablo]: { online: true, version: "0.10" },
      [USER.diego]: { online: true, version: "0.10" },
      [USER.camila]: { online: false, version: null },
      [USER.nicolas]: { online: false, version: "0.9" },
    },
    demo: true,
    deskId: DESK.root,
    deskName: "Mesa de prueba Mauricio",
    historicalBillingByUser,
    history: snapshots.map((snapshot) => {
      const root = snapshot.overview.desks.find((desk) => desk.id === DESK.root)!;
      const manager = snapshot.overview.people.find((person) => person.id === USER.mauricio)!;
      return {
        administrationIncome: manager.mesaIncome,
        month: snapshot.month,
        structureBilling: root.structureGross,
        totalIncome: manager.totalIncome,
      };
    }),
    identitiesByUser: {
      [USER.mauricio]: { active: 1, total: 1 },
      [USER.laura]: { active: 2, total: 2 },
      [USER.sofia]: { active: 1, total: 2 },
      [USER.pablo]: { active: 0, total: 0 },
      [USER.diego]: { active: 3, total: 3 },
      [USER.camila]: { active: 1, total: 1 },
      [USER.nicolas]: { active: 1, total: 2 },
    },
    lastOperatedOnByUser: {
      [USER.mauricio]: "2026-10-03", [USER.laura]: "2026-10-02", [USER.sofia]: "2026-10-03",
      [USER.pablo]: "2026-10-01", [USER.diego]: "2026-10-03", [USER.camila]: "2026-09-29", [USER.nicolas]: "2026-10-02",
    },
    month: months[2],
    overview: current.overview,
    preview: false,
    priorPeriodGrossByUser,
    profilesByUser,
    summaries,
    suggestions,
    termsEditable: true,
    userId: USER.mauricio,
  };
}

