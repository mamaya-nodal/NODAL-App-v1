import { describe, expect, it } from "vitest";

import { connectorVersionState } from "./connector-version";

describe("estado de versión del conector", () => {
  it("no propone degradar un piloto más nuevo que el ZIP publicado", () => {
    expect(connectorVersionState({ installedSourceVersion: "0.12", runningVersion: "0.12", latestVersion: "0.11" })).toBe("current");
  });
  it("informa que falta activar el piloto copiado", () => {
    expect(connectorVersionState({ installedSourceVersion: "0.12", runningVersion: "0.9", latestVersion: "0.11" })).toBe("pending_activation");
  });
  it("compara segmentos numéricos, no orden alfabético", () => {
    expect(connectorVersionState({ installedSourceVersion: null, runningVersion: "0.9", latestVersion: "0.11" })).toBe("update_available");
  });
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
