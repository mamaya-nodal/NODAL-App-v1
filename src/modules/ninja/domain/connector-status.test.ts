import { describe, expect, it } from "vitest";

import { effectiveConnectorSignal } from "./connector-status";

describe("effectiveConnectorSignal", () => {
  it("reports the user connected when a broker is detected through an identity", () => {
    expect(effectiveConnectorSignal([
      { identityId: null, isOnline: false, status: "active" },
      { identityId: "identity-1", isOnline: true, status: "active" },
    ], true)).toEqual({ linked: true, online: true });
  });

  it("reports the user connected when only an identity detects the broker", () => {
    expect(effectiveConnectorSignal([
      { identityId: "identity-1", isOnline: true, status: "active" },
    ], true)).toEqual({ linked: true, online: true });
  });

  it("does not call a heartbeat without a detected broker connected", () => {
    expect(effectiveConnectorSignal([
      { identityId: null, isOnline: true, status: "active" },
      { identityId: "identity-1", isOnline: true, status: "active" },
    ], false)).toEqual({ linked: true, online: false });
  });

  it("does not treat a stored broker snapshot as a current connection", () => {
    expect(effectiveConnectorSignal([
      { identityId: null, isOnline: false, status: "active" },
      { identityId: "identity-1", isOnline: false, status: "active" },
    ], true)).toEqual({ linked: true, online: false });
  });

  it("ignores a stored broker when every connector is revoked", () => {
    expect(effectiveConnectorSignal([
      { identityId: "identity-1", isOnline: true, status: "revoked" },
    ], true)).toEqual({ linked: false, online: false });
  });
});
