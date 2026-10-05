import type { MasterControlData } from "./load-master-control";
import { buildAdminPanelDemo } from "./admin-panel-demo";
import { ROOT_DESK } from "../domain/desks";

export function buildMasterControlDemo(): MasterControlData {
  const adminDemo = buildAdminPanelDemo();

  return {
    chart: adminDemo.history.map((point) => ({
      month: point.month,
      values: Object.fromEntries(adminDemo.overview.desks.map((desk) => [desk.id, desk.gross])),
    })),
    connectorByUser: adminDemo.connectorByUser,
    currentMonth: adminDemo.month,
    demo: true,
    historicalGrossByUser: adminDemo.historicalBillingByUser,
    historicCommission: Object.fromEntries(
      adminDemo.overview.people.map((person) => [person.id, person.commission]),
    ),
    history: [],
    identifierHistoryByUser: Object.fromEntries(
      Object.entries(adminDemo.identifierHistoryByUser).map(([userId, entries]) => [
        userId,
        entries.map((entry) => ({
          desk_id: entry.deskId,
          display_id: entry.displayId,
          reason: entry.reason,
          user_id: userId,
          valid_from: entry.validFrom,
          valid_to: entry.validTo,
        })),
      ]),
    ),
    identifiersByUser: adminDemo.displayIdByUser,
    identitiesByUser: Object.fromEntries(
      Object.entries(adminDemo.detailByUser).map(([userId, detail]) => [
        userId,
        detail.identities.map((identity) => ({
          id: identity.id,
          name: identity.name,
          state: identity.state,
        })),
      ]),
    ),
    mode: "real",
    month: adminDemo.month,
    overview: adminDemo.overview,
    pendingAccessCount: 4,
    performanceHistory: adminDemo.history.map((point) => ({
      gross: point.structureBilling,
      month: point.month,
      nodalIncome: point.totalIncome,
    })),
    periods: adminDemo.history.map((point) => point.month).reverse(),
    profilesByUser: adminDemo.profilesByUser,
    ready: true,
    units: [{
      code: "ND",
      id: "demo-unit-nodal",
      name: "Unidad NODAL",
      ordinal: 1,
      root_desk_id: ROOT_DESK,
    }],
  };
}
