import { describe, expect, it } from "vitest";

import { findNodalitoGuide } from "./nodalito-faq";

describe("findNodalitoGuide", () => {
  it.each([
    ["¿Dónde veo mis billeteras?", "wallets-location"],
    ["¿Cómo cargo un movimiento de saldo billetera?", "wallet-movement"],
    ["como registro un payout", "payout-registration"],
  ])("responde %s sin usar IA", (question, expected) => {
    expect(findNodalitoGuide(question)?.id).toBe(expected);
  });

  it("no inventa una guía cuando no reconoce la consulta", () => {
    expect(findNodalitoGuide("Revisá la facturación de ayer")).toBeNull();
  });

  it.each([
    ["no puedo eliminar una billetera", "delete-wallet"],
    ["el conector dice sin señal", "connector-no-signal"],
    ["cómo envío MIMICAL a una identidad", "identity-installer"],
    ["como creo una identidad?", "create-identity"],
    ["cómo creo una billetera nueva", "create-wallet"],
    ["dónde veo qué cuenta está operando ahora", "live-operations"],
    ["por qué no aparece la última operación", "stale-data"],
    ["cómo confirmo el punto de partida", "starting-point"],
  ])("cubre la pregunta frecuente %s", (question, expected) => {
    expect(findNodalitoGuide(question)?.id).toBe(expected);
  });
});
