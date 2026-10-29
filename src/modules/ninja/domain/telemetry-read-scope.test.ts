import { describe, expect, it } from "vitest";
import { filterNinjaTelemetryReadScope } from "./telemetry-read-scope";

describe("Ninja telemetry read scope", () => {
  it("keeps the confirmed partition and hides pending or discarded broker activity", () => {
    const result = filterNinjaTelemetryReadScope({
      batches: [
        { id: "foreign", broker: { account_name: "2177299" } },
        { id: "own", broker: { account_name: "2292943" } },
      ],
      events: [
        { id: 1, account_name: "2177299" },
        { id: 2, account_name: "2292943" },
        { id: 3, account_name: "LFF05091986490004" },
      ],
      hiddenBrokerAccountNames: [" 2177299 "],
      operations: [
        { id: 10, account_name: "2177299" },
        { id: 11, account_name: "2292943" },
      ],
    });
    expect(result.events.map((row) => row.id)).toEqual([2, 3]);
    expect(result.operations.map((row) => row.id)).toEqual([11]);
    expect(result.batches.map((row) => row.id)).toEqual(["own"]);
  });
});
