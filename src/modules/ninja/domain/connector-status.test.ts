import { describe, expect, it } from "vitest";

import { principalConnectorSignal } from "./connector-status";

describe("principalConnectorSignal", () => {
  it("does not confuse an online identity connector with the principal connector", () => {
    expect(principalConnectorSignal([
      { identityId: null, isOnline: false, status: "active" },
      { identityId: "identity-1", isOnline: true, status: "active" },
    ])).toEqual({ linked: true, online: false });
  });

  it("does not report a principal link when only an identity connector exists", () => {
    expect(principalConnectorSignal([
      { identityId: "identity-1", isOnline: true, status: "active" },
    ])).toEqual({ linked: false, online: false });
  });
});
