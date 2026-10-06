import {
  calculateDeskOverview,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "../domain/desks";
import { formatNodalUserIdentifier } from "../domain/nodal-identifiers";
import type { MasterControlData } from "./load-master-control";

const months = ["2026-08-01", "2026-09-01", "2026-10-01"] as const;

const units = [
  { agreement_bps: 2500, code: "ND", id: "demo-unit-nd", name: "Unidad NODAL", ordinal: 1, responsible_email: "mauricio@nodal.test", responsible_name: "Mauricio Amaya", root_desk_id: "demo-nd-root" },
  { agreement_bps: 3000, code: "HW", id: "demo-unit-hw", name: "Unidad Highway", ordinal: 2, responsible_email: "elena@highway.test", responsible_name: "Elena Ruiz", root_desk_id: "demo-hw-root" },
  { agreement_bps: 3600, code: "AT", id: "demo-unit-at", name: "Unidad Atlas", ordinal: 3, responsible_email: "martina@atlas.test", responsible_name: "Martina López", root_desk_id: "demo-at-root" },
  { agreement_bps: 3300, code: "AP", id: "demo-unit-ap", name: "Unidad Apex", ordinal: 4, responsible_email: "tomas@apex.test", responsible_name: "Tomás Vidal", root_desk_id: "demo-ap-root" },
] as const;

const desks: Desk[] = [
  { created_at: "2026-08-01T10:00:00Z", id: "demo-nd-root", name: "Mesa principal NODAL", parent_id: null },
  { created_at: "2026-08-02T10:00:00Z", id: "demo-nd-m01", name: "MESA DE ALFRED", parent_id: "demo-nd-root" },
  { created_at: "2026-08-03T10:00:00Z", id: "demo-nd-m02", name: "MESA DE CAMILA", parent_id: "demo-nd-m01" },
  { created_at: "2026-08-04T10:00:00Z", id: "demo-hw-root", name: "Mesa principal Highway", parent_id: null },
  { created_at: "2026-08-05T10:00:00Z", id: "demo-hw-m01", name: "MESA DE ELENA", parent_id: "demo-hw-root" },
  { created_at: "2026-08-06T10:00:00Z", id: "demo-hw-m02", name: "MESA DE BRUNO", parent_id: "demo-hw-m01" },
  { created_at: "2026-08-07T10:00:00Z", id: "demo-at-root", name: "Mesa principal Atlas", parent_id: null },
  { created_at: "2026-08-08T10:00:00Z", id: "demo-at-m01", name: "MESA DE MARTINA", parent_id: "demo-at-root" },
  { created_at: "2026-08-09T10:00:00Z", id: "demo-ap-root", name: "Mesa principal Apex", parent_id: null },
  { created_at: "2026-08-10T10:00:00Z", id: "demo-ap-m01", name: "MESA DE TOMÁS", parent_id: "demo-ap-root" },
];

const personSpecs = [
  ["demo-mauricio", "Mauricio Amaya", "demo-nd-root", 1_320_000, true],
  ["demo-alfred", "Alfred", "demo-nd-root", 1_860_000, false],
  ["demo-sebastian", "Sebastián", "demo-nd-root", 980_000, false],
  ["demo-rodolfo", "Rodolfo", "demo-nd-root", 740_000, false],
  ["demo-camila", "Camila Paz", "demo-nd-m01", 1_110_000, false],
  ["demo-nicolas", "Nicolás Vera", "demo-nd-m01", 690_000, false],
  ["demo-lara", "Lara Núñez", "demo-nd-m02", 830_000, false],
  ["demo-mateo", "Mateo Silva", "demo-nd-m02", 570_000, false],
  ["demo-elena", "Elena Ruiz", "demo-hw-root", 1_540_000, false],
  ["demo-lucas", "Lucas Ferreyra", "demo-hw-root", 760_000, false],
  ["demo-bruno", "Bruno Costa", "demo-hw-m01", 1_280_000, false],
  ["demo-carla", "Carla Méndez", "demo-hw-m01", 920_000, false],
  ["demo-julia", "Julia Campos", "demo-hw-m02", 680_000, false],
  ["demo-martina", "Martina Rossi", "demo-at-root", 1_470_000, false],
  ["demo-franco", "Franco Gil", "demo-at-root", 810_000, false],
  ["demo-paula", "Paula Vidal", "demo-at-m01", 1_050_000, false],
  ["demo-gonzalo", "Gonzalo Rey", "demo-at-m01", 620_000, false],
  ["demo-tomas", "Tomás Acosta", "demo-ap-root", 1_390_000, false],
  ["demo-daniela", "Daniela Sosa", "demo-ap-root", 870_000, false],
  ["demo-ivan", "Iván Pereyra", "demo-ap-m01", 1_020_000, false],
  ["demo-renata", "Renata León", "demo-ap-m01", 650_000, false],
] as const;

const managerByDesk: Record<string, string> = {
  "demo-nd-m01": "demo-alfred",
  "demo-nd-m02": "demo-camila",
  "demo-hw-m01": "demo-elena",
  "demo-hw-m02": "demo-bruno",
  "demo-at-m01": "demo-martina",
  "demo-ap-m01": "demo-tomas",
};

const deskTerms: DeskTerms[] = desks.map((desk) => ({
  active: true,
  desk_id: desk.id,
  effective_month: months[0],
  manager_id: managerByDesk[desk.id] ?? null,
  nodal_bps: desk.parent_id === null ? 10_000 : 2_500 + ((desks.indexOf(desk) % 4) * 500),
}));

const userTerms: UserTerms[] = personSpecs.map(([id, , deskId], index) => ({
  bonus_enabled: false,
  commission_bps: 3_500 + ((index % 5) * 500),
  desk_id: deskId,
  effective_month: months[0],
  level: index % 3 === 0 ? 2 : 1,
  state: "active",
  user_id: id,
}));

const unitByDesk: Record<string, string> = {
  "demo-nd-root": "demo-unit-nd", "demo-nd-m01": "demo-unit-nd", "demo-nd-m02": "demo-unit-nd",
  "demo-hw-root": "demo-unit-hw", "demo-hw-m01": "demo-unit-hw", "demo-hw-m02": "demo-unit-hw",
  "demo-at-root": "demo-unit-at", "demo-at-m01": "demo-unit-at",
  "demo-ap-root": "demo-unit-ap", "demo-ap-m01": "demo-unit-ap",
};

const unitByUser = Object.fromEntries(personSpecs.map(([id, , deskId]) => [id, unitByDesk[deskId]]));

function peopleForMonth(monthIndex: number): Person[] {
  const factor = [0.76, 0.89, 1][monthIndex];
  return personSpecs.map(([id, name, , gross, master]) => ({
    access: "active",
    email: `${id.replace("demo-", "")}@nodal.test`,
    gross: Math.round(gross * factor),
    id,
    legacyCommission: 0,
    master,
    name,
  }));
}

function identifierFor(userId: string, deskId: string) {
  const unit = units.find((candidate) => candidate.id === unitByUser[userId])!;
  const childDesks = desks.filter((desk) => unitByDesk[desk.id] === unit.id && desk.parent_id !== null);
  const deskCode = deskId === unit.root_desk_id
    ? "MP"
    : `M${String(childDesks.findIndex((desk) => desk.id === deskId) + 1).padStart(2, "0")}`;
  const position = personSpecs.filter(([, , candidateDesk]) => candidateDesk === deskId)
    .findIndex(([candidateId]) => candidateId === userId) + 1;
  return formatNodalUserIdentifier(unit.code, deskCode, position);
}

export function buildMasterControlDemo(requestedMonth?: string): MasterControlData {
  const now = Date.now();
  const snapshots = months.map((month, monthIndex) => ({
    month,
    overview: calculateDeskOverview(desks, deskTerms, peopleForMonth(monthIndex), userTerms, month),
  }));
  const requestedIndex = requestedMonth
    ? months.findIndex((month) => month === requestedMonth)
    : -1;
  const currentIndex = requestedIndex >= 0 ? requestedIndex : snapshots.length - 1;
  const availableSnapshots = snapshots.slice(0, currentIndex + 1);
  const current = snapshots[currentIndex]!;
  const identifiersByUser = Object.fromEntries(personSpecs.map(([id, , deskId]) => [id, identifierFor(id, deskId)]));
  const historicalGrossByUser = Object.fromEntries(personSpecs.map(([id]) => [
    id,
    availableSnapshots.reduce((sum, snapshot) => sum + (snapshot.overview.people.find((person) => person.id === id)?.gross ?? 0), 0),
  ]));
  const profilesByUser = Object.fromEntries(personSpecs.map(([id, name, , , master], index) => [id, {
    access_role: master ? ("admin" as const) : ("student" as const),
    access_state: "active",
    contact_email: `${id.replace("demo-", "")}@nodal.test`,
    created_at: `2026-08-${String((index % 27) + 1).padStart(2, "0")}T10:00:00Z`,
    display_name: name,
    email: `${id.replace("demo-", "")}@nodal.test`,
    id,
    identities_enabled: index % 5 !== 3,
  }]));
  const identitiesByUser = Object.fromEntries(personSpecs.map(([id, name], index) => [id,
    Array.from({ length: index % 4 }, (_, identityIndex) => ({
      id: `IDENT-${id.replace("demo-", "").toUpperCase()}-${identityIndex + 1}`,
      name: `${name.split(" ")[0]} ${["Capital", "Trading", "Futuros"][identityIndex]}`,
      state: identityIndex === 2 ? "Pausada" : "Activa",
    })),
  ]));
  const connectorByUser = Object.fromEntries(personSpecs.map(([id], index) => [id, {
    active: index % 4 !== 2,
    lastSeenAt: index % 6 === 5 ? null : new Date(now - ((index % 4 === 2 ? 31 : 2 + index) * 3_600_000)).toISOString(),
    version: index % 6 === 5 ? null : index % 4 === 2 ? "0.9" : "0.10",
  }]));
  const unitSummaries = units.map((unit) => {
    const people = current.overview.people.filter((person) => unitByUser[person.id] === unit.id);
    const unitDesks = current.overview.desks.filter((desk) => unitByDesk[desk.id] === unit.id);
    return {
      deskCount: unitDesks.length,
      gross: people.reduce((sum, person) => sum + person.gross, 0),
      id: unit.id,
      nodalIncome: unitDesks.find((desk) => desk.id === unit.root_desk_id)?.nodalShare ?? 0,
      userCount: people.length,
    };
  });

  return {
    chart: snapshots.map((snapshot) => ({
      month: snapshot.month,
      values: Object.fromEntries(units.map((unit) => [unit.id,
        snapshot.overview.people.filter((person) => unitByUser[person.id] === unit.id).reduce((sum, person) => sum + person.gross, 0),
      ])),
    })),
    connectorByUser,
    currentMonth: current.month,
    demo: true,
    historicalGrossByUser,
    historicCommission: Object.fromEntries(current.overview.people.map((person) => [person.id, person.commission])),
    history: [],
    identifierHistoryByUser: Object.fromEntries(personSpecs.map(([id, , deskId]) => [id, [{
      desk_id: deskId,
      display_id: identifiersByUser[id],
      reason: "Asignación de escenario ficticio",
      user_id: id,
      valid_from: "2026-08-01T10:00:00Z",
      valid_to: null,
    }]])),
    identifiersByUser,
    identitiesByUser,
    mode: "real",
    month: current.month,
    overview: current.overview,
    pendingAccessCount: 6,
    performanceHistory: availableSnapshots.map((snapshot) => ({
      gross: snapshot.overview.gross,
      month: snapshot.month,
      nodalIncome: snapshot.overview.nodalIncome,
    })),
    periods: [...months].reverse(),
    profilesByUser,
    ready: true,
    unitByDesk,
    unitByUser,
    unitSummaries,
    units: [...units],
  };
}
