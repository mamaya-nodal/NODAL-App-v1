import { describe, expect, it } from "vitest";

import { calculateBrokerRatio, formatBrokerRatio } from "./broker-ratio";

describe("ratio broker", () => {
  it("multiplica la cobertura por las cuentas y divide por los contratos de ruta", () => {
    expect(calculateBrokerRatio({
      coverageContractsPerAccount: 1,
      fundingAccountCount: 5,
      routeContractsPerAccount: 4,
    })).toBe(-1.25);
  });

  it("rechaza cantidades nulas o negativas", () => {
    expect(() => calculateBrokerRatio({
      coverageContractsPerAccount: 1,
      fundingAccountCount: 5,
      routeContractsPerAccount: 0,
    })).toThrow("mayores que cero");
  });

  it("formatea sin ceros innecesarios", () => {
    expect(formatBrokerRatio(-1.25)).toBe("-1,25");
  });
});
