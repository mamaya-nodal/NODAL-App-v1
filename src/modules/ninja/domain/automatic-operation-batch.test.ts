import { describe, expect, it } from "vitest";

import {
  brokerAccountConflicts,
  countBrokerContextProps,
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
    minimumNetLiquidation: 49_900,
    minimumNetLiquidationAt: "2026-09-08T14:00:09.000Z",
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
      quantity: 1,
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

  it("does not require broker and replicated prop quantities to be equal", () => {
    const props = Array.from({ length: 5 }, (_, index) => operation({
      accountName: `TFY${index + 40}`,
      direction: "Long",
      quantity: 3,
      role: "prop",
    }));
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      quantity: 1,
      result: 720.64,
      role: "broker",
    });

    expect(correlateAutomaticOperationBatches([...props, broker])[0]).toMatchObject({
      brokerResultInCents: 72_064,
      distributedInCents: 72_065,
      props: Array.from({ length: 5 }, () => expect.objectContaining({
        allocatedBrokerResultInCents: 14_413,
      })),
      roundingDifferenceInCents: 1,
      status: "ready",
    });
  });

  it("preserves unregistered prop legs so the batch cannot close with only a subset", () => {
    const props = Array.from({ length: 5 }, (_, index) => operation({
      accountId: index < 2 ? `account-${index}` : null,
      accountName: `TFY${index + 50}`,
      direction: "Long",
      quantity: 3,
      role: "prop",
    }));
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      quantity: 1,
      result: 699.26,
      role: "broker",
    });

    const [batch] = correlateAutomaticOperationBatches([...props, broker]);

    expect(batch.status).toBe("ready");
    expect(batch.props).toHaveLength(5);
    expect(batch.props.filter((prop) => prop.accountId === null)).toHaveLength(3);
    expect(batch.props.map((prop) => prop.allocatedBrokerResultInCents))
      .toEqual([13_985, 13_985, 13_985, 13_985, 13_985]);
    expect(batch.roundingDifferenceInCents).toBe(-1);
  });

  it("matches NQ prop legs with an MNQ broker hedge for the same contract", () => {
    const props = Array.from({ length: 5 }, (_, index) => operation({
      accountName: `TDFY${index + 1}`,
      direction: "Long",
      instruments: ["NQ DEC26"],
      openedAt: "2026-09-08T14:00:08.000Z",
      quantity: 2,
      role: "prop",
    }));
    const broker = operation({
      accountName: "2018194",
      direction: "Short",
      instruments: ["MNQ DEC26"],
      quantity: 5,
      role: "broker",
    });

    expect(countBrokerContextProps([...props, broker], broker)).toBe(5);
    expect(correlateAutomaticOperationBatches([...props, broker])[0]).toMatchObject({
      props: expect.arrayContaining(props.map((prop) => expect.objectContaining({
        accountName: prop.accountName,
      }))),
      status: "ready",
    });
  });

  it("does not match NQ and MNQ when the contract differs", () => {
    const prop = operation({
      accountName: "LUCID1",
      direction: "Long",
      instruments: ["NQ DEC26"],
      quantity: 1,
      role: "prop",
    });
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      instruments: ["MNQ MAR27"],
      quantity: 1,
      role: "broker",
    });

    expect(correlateAutomaticOperationBatches([prop, broker])[0]).toMatchObject({
      props: [],
      status: "unmatched",
    });
  });

  it("does not match operations opened more than ten seconds apart", () => {
    const prop = operation({
      accountName: "LUCID1",
      direction: "Long",
      instruments: ["NQ DEC26"],
      openedAt: "2026-09-08T14:00:12.000Z",
      quantity: 1,
      role: "prop",
    });
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      instruments: ["MNQ DEC26"],
      quantity: 1,
      role: "broker",
    });

    expect(correlateAutomaticOperationBatches([prop, broker])[0]).toMatchObject({
      props: [],
      status: "unmatched",
    });
  });

  it("does not infer equivalences for other micro and mini instruments", () => {
    const prop = operation({
      accountName: "LUCID1",
      direction: "Long",
      instruments: ["ES DEC26"],
      quantity: 1,
      role: "prop",
    });
    const broker = operation({
      accountName: "Broker principal",
      direction: "Short",
      instruments: ["MES DEC26"],
      quantity: 1,
      role: "broker",
    });

    expect(correlateAutomaticOperationBatches([prop, broker])[0]).toMatchObject({
      props: [],
      status: "unmatched",
    });
  });
});
