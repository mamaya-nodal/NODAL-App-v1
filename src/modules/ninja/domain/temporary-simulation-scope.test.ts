import { describe, expect, it } from "vitest";
import { classifyNinjaAccount } from "./account-classification";
import { normalizeNinjaInventorySnapshot, type NinjaAccountSnapshot } from "./ingestion-payload";
import { stampTemporarySimulationAccount, temporarySimulationRole, TEMPORARY_SIMULATION_CONNECTORS } from "./temporary-simulation-scope";

const at = "2026-11-14T22:00:00Z";
const account = (name: string): NinjaAccountSnapshot => ({
  accountName: name, connectionName: "Simulated Data Feed", connectionStatus: "Connected",
  providerName: "Simulator", cashValue: 50_000, netLiquidation: 50_000,
  totalCashBalance: 0, realizedProfitLoss: 0, unrealizedProfitLoss: 0,
});

describe("authorized temporary production rehearsal", () => {
  it("retains normal simulator exclusion without authenticated test origin", () => {
    expect(classifyNinjaAccount(account("Simbroker"), at).type).toBe("simulator");
    expect(classifyNinjaAccount(account("Sim101"), at, "another-user-connector").type).toBe("simulator");
  });
  it("recognizes both subaccounts from either installation of the same owner", () => {
    expect(classifyNinjaAccount(account("Simbroker"), at, TEMPORARY_SIMULATION_CONNECTORS[0]).type).toBe("broker");
    expect(classifyNinjaAccount(account("SimSimbroker"), at, TEMPORARY_SIMULATION_CONNECTORS[1]).type).toBe("broker");
    expect(classifyNinjaAccount(account("Simbroker"), at, TEMPORARY_SIMULATION_CONNECTORS[1]).type).toBe("broker");
    expect(classifyNinjaAccount(account("SimSimbroker"), at, TEMPORARY_SIMULATION_CONNECTORS[0]).type).toBe("broker");
    expect(temporarySimulationRole(account("Simprop3"), at, TEMPORARY_SIMULATION_CONNECTORS[0])).toBeNull();
  });
  it.each(["Simprop1", "Simprop2", "Simprop 2"])("admits the explicitly authorized additional prop %s only in the rehearsal scope", (name) => {
    for (const connector of TEMPORARY_SIMULATION_CONNECTORS) {
      expect(classifyNinjaAccount(account(name), at, connector)).toMatchObject({ type: "prop", companyCode: "LUCID", phase: "Evaluation", accountSizeInCents: 5_000_000 });
    }
    expect(classifyNinjaAccount(account(name), at, "another-user-connector").type).toBe("simulator");
    expect(temporarySimulationRole(account(name), "2026-11-16T03:00:00Z", TEMPORARY_SIMULATION_CONNECTORS[0])).toBeNull();
  });
  it("reuses Lucid Flex evaluation classification while preserving raw names and balances", () => {
    const source = account("Sim101");
    const stamped = stampTemporarySimulationAccount(source, TEMPORARY_SIMULATION_CONNECTORS[1], at);
    expect(classifyNinjaAccount(stamped, at)).toMatchObject({ type: "prop", companyCode: "LUCID", phase: "Evaluation", accountSizeInCents: 5_000_000 });
    expect(stamped).toMatchObject(source);
    expect(source).not.toHaveProperty("nodalTestPhysicalConnectorId");
  });
  it("strips forged provenance before any incoming inventory can reach routing", () => {
    const forged = { ...account("Simbroker"), nodalTestPhysicalConnectorId: TEMPORARY_SIMULATION_CONNECTORS[0] };
    const normalized = normalizeNinjaInventorySnapshot({ accounts: [forged], eventId: "test", kind: "inventory_snapshot", observedAt: at });
    expect(classifyNinjaAccount(normalized.accounts[0], at).type).toBe("simulator");
    expect(normalized.accounts[0]).not.toHaveProperty("nodalTestPhysicalConnectorId");
  });
  it("uses the observed inventory time for test admission without rewriting an older first-seen date", () => {
    const stamped = stampTemporarySimulationAccount(account("Simprop1"), TEMPORARY_SIMULATION_CONNECTORS[0], at);
    const firstSeen = "2026-09-10T12:00:00Z";
    expect(classifyNinjaAccount(stamped, firstSeen, undefined, at)).toMatchObject({ type: "prop", firstSeenAt: firstSeen });
    expect(classifyNinjaAccount(stamped, firstSeen, undefined, "2026-11-16T03:00:00Z").type).not.toBe("prop");
  });
  it.each(["2026-11-14T20:44:59Z", "2026-11-16T03:00:00Z", "invalid"])("rejects events outside the authorized window: %s", (date) => {
    expect(temporarySimulationRole(account("Simbroker"), date, TEMPORARY_SIMULATION_CONNECTORS[0])).toBeNull();
  });
  it("does not promote SIM accounts observed through live connections", () => {
    expect(temporarySimulationRole({ ...account("Simbroker"), connectionName: "Live" }, at, TEMPORARY_SIMULATION_CONNECTORS[0])).toBeNull();
  });
});
