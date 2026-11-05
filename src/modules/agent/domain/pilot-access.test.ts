import { describe, expect, it } from "vitest";

import { canUseNodalAgentPilot } from "./pilot-access";

describe("canUseNodalAgentPilot", () => {
  it("habilita el piloto solamente para el login habitual de Mauricio", () => {
    expect(canUseNodalAgentPilot("mauriciosebastianamaya@gmail.com")).toBe(true);
    expect(canUseNodalAgentPilot(" MauricioSebastianAmaya@gmail.com ")).toBe(true);
    expect(canUseNodalAgentPilot("mamaya@nodaltrading.com")).toBe(false);
    expect(canUseNodalAgentPilot(null)).toBe(false);
  });
});
