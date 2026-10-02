import { describe, expect, it } from "vitest";

import { phaseTradeLabel } from "./load-period-close-report-snapshot";

const base = {
  account_id: "account-1",
  destination: "NETO BROKER +" as const,
  id: "entry",
  magnitude_cents: 100,
  operated_on: "2026-10-02",
  participant_role: "leader" as const,
  phase: "Evaluacion" as const,
};

describe("día de trade del informe de cierre", () => {
  it("numera trades y no fechas calendario", () => {
    const entries = [
      { ...base, created_at: "2026-10-02T14:00:00Z", daily_control_id: "trade-1", id: "one" },
      { ...base, created_at: "2026-10-02T15:00:00Z", daily_control_id: "trade-2", id: "two" },
    ];
    expect(phaseTradeLabel(entries, ["account-1"], "Evaluacion", "trade-1")).toBe("Evaluación D1");
    expect(phaseTradeLabel(entries, ["account-1"], "Evaluacion", "trade-2")).toBe("Evaluación D2");
  });

  it("deduplica las entradas del mismo trade", () => {
    const entries = [
      { ...base, created_at: "2026-10-02T14:00:00Z", daily_control_id: "trade-1", id: "one" },
      { ...base, created_at: "2026-10-02T14:00:01Z", daily_control_id: "trade-1", id: "two" },
    ];
    expect(phaseTradeLabel(entries, ["account-1"], "Evaluacion", "trade-1")).toBe("Evaluación D1");
  });
});
