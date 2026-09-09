import { describe, expect, it } from "vitest";

import {
  brokerAccountConflicts,
  correlateAutomaticOperationBatches,
  type ClassifiedTechnicalOperation,
} from "./automatic-operation-batch";

function operation(input: Partial<ClassifiedTechnicalOperation> & Pick<ClassifiedTechnicalOperation, "accountName" | "direction" | "quantity" | "role">): ClassifiedTechnicalOperation {
  return {
    accountId: input.role === "prop" ? `account-${input.accountName}` : null,
    closingBalance: 50_100,
    connectionName: "Ninja Mauri",
    executionCount: 2,
    flatAt: "2026-09-08T14:00:10.000Z",
    instruments: ["MNQ DEC26"],
    lastEventAt: "2026-09-08T14:00:11.000Z",
    openedAt: "2026-09-08T14:00:01.000Z",
    openingBalance: 50_000,
    openingEventId: Number(input.accountName.replace(/\D/g, "")) || 1,
    result: 100,
    settledAt: "2026-09-08T14:00:21.000Z",
    status: "closed",
    ...input,
  };
}

describe("automatic operation batches", () => {
  it("links five prop legs with their opposite broker hedge without user assignment", () => {
    const props = Array.from({ length: 5 }, (_, index) => operation({
      accountName: `TFY${index + 35}`,
      direction: "Long",
      quantity: 1,
      role: "prop",
    }));
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      quantity: 5,
      result: 500,
      role: "broker",
    });

    const [batch] = correlateAutomaticOperationBatches([...props, broker]);

    expect(batch.status).toBe("ready");
    expect(batch.props).toHaveLength(5);
    expect(batch.props.every((prop) => prop.allocatedBrokerResultInCents === 10_000)).toBe(true);
    expect(batch.roundingDifferenceInCents).toBe(0);
  });

  it("uses the same two-decimal rounding as Sheets", () => {
    const props = Array.from({ length: 3 }, (_, index) => operation({
      accountName: `LUCID${index + 23}`,
      direction: "Long",
      quantity: 1,
      role: "prop",
    }));
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      quantity: 3,
      result: -322.28,
      role: "broker",
    });

    const [batch] = correlateAutomaticOperationBatches([...props, broker]);

    expect(batch.props.map((prop) => prop.allocatedBrokerResultInCents)).toEqual([-10_743, -10_743, -10_743]);
    expect(batch.roundingDifferenceInCents).toBe(-1);
  });

  it("detects when the same broker account is assigned to simultaneous cycles", () => {
    const first = operation({ accountName: "Broker principal", direction: "Short", quantity: 2, role: "broker", status: "open" });
    const second = operation({ accountName: "Broker principal", direction: "Short", quantity: 3, role: "broker", status: "settling", openingEventId: 99 });
    expect(brokerAccountConflicts([first, second])).toEqual(["Ninja Mauri\u0000Broker principal"]);
  });

  it("marks an ambiguous coverage as a conflict instead of guessing participants", () => {
    const props = Array.from({ length: 6 }, (_, index) => operation({
      accountName: `TFY${index + 40}`,
      direction: "Long",
      quantity: 1,
      role: "prop",
    }));
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      quantity: 5,
      role: "broker",
    });

    expect(correlateAutomaticOperationBatches([...props, broker])[0]).toMatchObject({
      props: [],
      status: "conflict",
    });
  });
});
