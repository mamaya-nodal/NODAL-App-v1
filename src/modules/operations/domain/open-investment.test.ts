import { describe, expect, it } from "vitest";

import { resolveOpenInvestmentInCents } from "./open-investment";

describe("capital invertido abierto", () => {
  it("incluye el costo pendiente de una cuenta virgen", () => {
    expect(resolveOpenInvestmentInCents({ accountingState: "virgin", accumulatedInCents: -13_800 })).toBe(13_800);
  });

  it("incorpora una pérdida de cobertura como capital comprometido", () => {
    expect(resolveOpenInvestmentInCents({ accountingState: "live", accumulatedInCents: -4_352 })).toBe(4_352);
  });

  it("no muestra inversión abierta cuando el acumulado es positivo o la cuenta cerró", () => {
    expect(resolveOpenInvestmentInCents({ accountingState: "live", accumulatedInCents: 160_000 })).toBe(0);
    expect(resolveOpenInvestmentInCents({ accountingState: "closed", accumulatedInCents: -4_352 })).toBe(0);
  });
});
