import { describe, expect, it } from "vitest";

import { resolveTraderLiveStatus } from "./trader-live-status";

const now = new Date("2026-11-02T15:00:00.000Z");
const currentConnector = { connectorVersion: "0.16", lastSeenAt: "2026-11-02T14:58:30.000Z", status: "active" };

describe("resolveTraderLiveStatus", () => {
  it("identifica los seis estados operativos sin depender de texto visual", () => {
    expect(resolveTraderLiveStatus({ appLastSeenAt: null, connectors: [], hasOpenOperation: false, now }).light).toBe("red");
    expect(resolveTraderLiveStatus({ appLastSeenAt: null, connectors: [{ ...currentConnector, lastSeenAt: "2026-11-02T14:40:00.000Z" }], hasOpenOperation: false, now }).light).toBe("gray");
    expect(resolveTraderLiveStatus({ appLastSeenAt: null, connectors: [currentConnector], hasOpenOperation: false, now }).light).toBe("blue");
    expect(resolveTraderLiveStatus({ appLastSeenAt: null, connectors: [currentConnector], hasOpenOperation: true, now }).light).toBe("yellow");
    expect(resolveTraderLiveStatus({ appLastSeenAt: "2026-11-02T14:59:30.000Z", connectors: [currentConnector], hasOpenOperation: true, now }).light).toBe("green");
    expect(resolveTraderLiveStatus({ appLastSeenAt: null, connectors: [{ ...currentConnector, lastSeenAt: "2026-11-02T14:40:00.000Z" }], hasOpenOperation: true, now }).light).toBe("orange");
  });

  it("marca rojo un conector activo pero desactualizado", () => {
    expect(resolveTraderLiveStatus({
      appLastSeenAt: null,
      connectors: [{ ...currentConnector, connectorVersion: "0.15" }],
      hasOpenOperation: false,
      now,
    }).light).toBe("red");
  });
});
