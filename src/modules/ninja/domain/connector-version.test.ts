import { describe, expect, it } from "vitest";

import { connectorVersionState } from "./connector-version";

describe("estado de versión del conector", () => {
  it("distingue código copiado de versión realmente ejecutada", () => {
    expect(connectorVersionState({
      installedSourceVersion: "0.9",
      latestVersion: "0.9",
      runningVersion: "0.8",
    })).toBe("pending_activation");
  });

  it("considera actualizada solamente la versión que está ejecutándose", () => {
    expect(connectorVersionState({
      installedSourceVersion: "0.9",
      latestVersion: "0.9",
      runningVersion: "0.9",
    })).toBe("current");
  });

  it("detecta una actualización disponible", () => {
    expect(connectorVersionState({
      installedSourceVersion: null,
      latestVersion: "0.9",
      runningVersion: "0.4",
    })).toBe("update_available");
  });
});
