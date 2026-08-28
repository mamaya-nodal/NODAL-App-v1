import { describe, expect, it } from "vitest";

import { hashConnectorSecret, normalizePairingCode } from "./connector-auth";

describe("Ninja connector credentials", () => {
  it("normalizes the code shown to the user", () => {
    expect(normalizePairingCode(" ab3d-7k9q ")).toBe("AB3D7K9Q");
  });

  it("stores only a deterministic SHA-256 digest", () => {
    expect(hashConnectorSecret("secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashConnectorSecret("secret")).not.toContain("secret");
  });
});
