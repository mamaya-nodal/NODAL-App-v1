import { describe, expect, it } from "vitest";

import { calculateAccountResult } from "./account-phase-results";
import type { OperationRegisterEntry } from "./operation-register";

const entry = (
  phase: OperationRegisterEntry["phase"],
  destination: OperationRegisterEntry["destination"],
  magnitudeInCents: number,
): OperationRegisterEntry => ({
  accountId: "account-1",
  accountReference: 1,
  companyId: "lucid",
  companyName: "LUCID",
  dailyControlId: `${phase}-${destination}`,
  destination,
  id: `${phase}-${destination}-${magnitudeInCents}`,
  magnitudeInCents,
  operatedOn: "2026-08-15",
  participantRole: "leader",
  phase,
});

describe("TOTAL GANANCIA por cuenta", () => {
  it("usa el precio de compra como el primer NETO BROKER - de Evaluación", () => {
    const result = calculateAccountResult(
      [entry("Evaluacion", "NETO BROKER +", 50_260)],
      [],
      "automatic",
      42_228,
    );

    expect(result.phaseResults[0]).toMatchObject({
      initialPurchasePriceInCents: 42_228,
      broker: { negativeInCents: 42_228, netInCents: 8_032 },
      totalGainInCents: 8_032,
    });
  });

  it("calcula Evaluacion solo desde NETO BROKER positivo y negativo", () => {
    const result = calculateAccountResult([
      entry("Evaluacion", "NETO BROKER +", 20_000),
      entry("Evaluacion", "NETO BROKER -", 5_000),
    ], []);

    expect(result.phaseResults[0]?.totalGainInCents).toBe(15_000);
    expect(result.state).toBe("closed");
  });

  it("suma el TOTAL RETIRO manual en una vuelta", () => {
    const result = calculateAccountResult(
      [entry("Primera vuelta", "NETO BROKER -", 8_000)],
      [{ accountId: "account-1", phase: "Primera vuelta", totalWithdrawalInCents: 12_500 }],
    );

    expect(result.phaseResults[1]?.totalGainInCents).toBe(4_500);
    expect(result.state).toBe("closed");
  });

  it("arrastra una pérdida a la vuelta siguiente como ANTERIOR", () => {
    const result = calculateAccountResult(
      [
        entry("Evaluacion", "NETO BROKER +", 20_000),
        entry("Evaluacion", "NETO BROKER -", 25_000),
        entry("Primera vuelta", "NETO BROKER +", 12_000),
      ],
      [],
    );

    expect(result.phaseResults[0]?.totalGainInCents).toBe(-5_000);
    expect(result.phaseResults[1]).toMatchObject({
      carryInCents: -5_000,
      totalGainInCents: 7_000,
    });
    expect(result.state).toBe("closed");
  });

  it("arrastra pérdidas consecutivas hasta la fase que las recupera", () => {
    const result = calculateAccountResult(
      [
        entry("Evaluacion", "NETO BROKER -", 37_900),
        entry("Primera vuelta", "NETO BROKER +", 57_868),
        entry("Segunda vuelta", "NETO BROKER +", 113_816),
      ],
      [
        { accountId: "account-1", phase: "Primera vuelta", totalWithdrawalInCents: 0 },
      ],
      "automatic",
    );

    expect(result.phaseResults.slice(0, 3).map((phase) => phase.totalGainInCents)).toEqual([
      -37_900,
      19_968,
      113_816,
    ]);
  });

  it("arrastra un total positivo a la vuelta siguiente cuando la cuenta fue forzada viva", () => {
    const result = calculateAccountResult(
      [
        entry("Evaluacion", "NETO BROKER +", 10_000),
        entry("Primera vuelta", "NETO BROKER -", 3_000),
      ],
      [],
      "manual_live",
    );

    expect(result.phaseResults[1]).toMatchObject({
      carryInCents: 10_000,
      totalGainInCents: 7_000,
    });
    expect(result.state).toBe("live");
  });

  it("restaura el cierre calculado al volver a Automatico", () => {
    const entries = [entry("Evaluacion", "NETO BROKER +", 10_000)];

    expect(calculateAccountResult(entries, [], "manual_live").state).toBe("live");
    expect(calculateAccountResult(entries, [], "automatic").state).toBe("closed");
  });

  it("reproduce el caso anonimizado LUCID 23 de la planilla", () => {
    const result = calculateAccountResult(
      [
        entry("Primera vuelta", "NETO BROKER +", 21_406),
        entry("Segunda vuelta", "NETO BROKER -", 61_164),
      ],
      [],
      "automatic",
      31_738,
    );

    expect(result.phaseResults.slice(0, 3).map((phase) => phase.totalGainInCents)).toEqual([
      -31_738,
      -10_332,
      -71_496,
    ]);
    expect(result.state).toBe("live");
  });
});
