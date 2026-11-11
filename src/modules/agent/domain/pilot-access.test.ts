import { describe, expect, it } from "vitest";

import { canUseNodalAgentPilot } from "./pilot-access";

describe("canUseNodalAgentPilot", () => {
  it("habilita el piloto solamente para Mauricio, Lore y Baltazar", () => {
    expect(canUseNodalAgentPilot("mauriciosebastianamaya@gmail.com")).toBe(true);
    expect(canUseNodalAgentPilot(" MauricioSebastianAmaya@gmail.com ")).toBe(true);
    expect(canUseNodalAgentPilot("loremalagreca@gmail.com")).toBe(true);
    expect(canUseNodalAgentPilot(" LoreMalagreca@gmail.com ")).toBe(true);
    expect(canUseNodalAgentPilot("financealmironbaltss@gmail.com")).toBe(true);
    expect(canUseNodalAgentPilot(" FinanceAlmironBaltss@gmail.com ")).toBe(true);
    expect(canUseNodalAgentPilot("mamaya@nodaltrading.com")).toBe(false);
    expect(canUseNodalAgentPilot("otro.usuario@gmail.com")).toBe(false);
    expect(canUseNodalAgentPilot(null)).toBe(false);
  });
});
