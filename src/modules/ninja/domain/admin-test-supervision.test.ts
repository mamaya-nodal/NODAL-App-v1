import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot } from "./ingestion-payload";
import {
  deriveNinjaTestReadiness,
  type AdminNinjaTestSupervision,
} from "./admin-test-supervision";

const now = Date.parse("2026-09-09T18:00:00.000Z");

function account(accountName: string, connectionName = "Ninja Ivo"): NinjaAccountSnapshot {
  return {
    accountName,
    cashValue: accountName === "1850465" ? 5_000 : 50_000,
    connectionName,
    connectionStatus: "Connected",
    netLiquidation: accountName === "1850465" ? 5_000 : 50_000,
    providerName: "Provider31",
    realizedProfitLoss: 0,
    totalCashBalance: 0,
    unrealizedProfitLoss: 0,
  };
}

function fixture(): AdminNinjaTestSupervision {
  return {
    batches: [],
    connections: [{ accountCount: 2, name: "Ninja Ivo", status: "approved" }],
    connector: {
      id: "connector",
      lastSeenAt: "2026-09-09T17:59:45.000Z",
      pairedAt: "2026-09-09T17:00:00.000Z",
      status: "active",
      version: "0.4",
    },
    currentPeriod: { id: "period", month: "2026-09-01" },
    inventory: {
      accounts: [account("1850465"), account("LFE05088021070001")],
      observedAt: "2026-09-09T17:59:45.000Z",
    },
    links: [{
      accountId: "prop-account",
      accountName: "LFE05088021070001",
      closedAt: null,
      company: "Lucid",
      connectionName: "Ninja Ivo",
      firstSeenAt: "2026-09-09T17:00:00.000Z",
      periodMonth: "2026-09-01",
      phase: "Evaluation",
      state: "virgin",
    }],
    sessions: [],
    user: {
      accessState: "active",
      email: "ivo@example.com",
      id: "ivo",
      name: "Ivo",
    },
  };
}

describe("Ninja test readiness", () => {
  it("is ready with a paired connector, active inventory and linked prop accounts", () => {
    const result = deriveNinjaTestReadiness(fixture(), now);

    expect(result.ready).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("accepts a newly observed connection without a second approval", () => {
    const data = fixture();
    const result = deriveNinjaTestReadiness({
      ...data,
      connections: [{ accountCount: 2, name: "Ninja Ivo", status: null }],
      links: [],
    }, now);

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.id === "connections")?.detail)
      .toBe("1 conexiones activas");
    expect(result.checks.find((check) => check.id === "links")?.detail)
      .toBe("1 cuentas prop pendientes de incorporar");
  });

  it("excludes an expressly isolated connection from the operational inventory", () => {
    const data = fixture();
    const result = deriveNinjaTestReadiness({
      ...data,
      connections: [{ accountCount: 2, name: "Ninja Ivo", status: "isolated" }],
    }, now);

    expect(result.ready).toBe(false);
    expect(result.props).toHaveLength(0);
    expect(result.brokers).toHaveLength(0);
    expect(result.checks.find((check) => check.id === "connections")?.detail)
      .toBe("Todavía no hay conexiones activas");
  });
});
