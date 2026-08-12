import { describe, expect, it } from "vitest";

import {
  entriesForAccount,
  summarizeBrokerEntries,
  type OperationRegisterEntry,
} from "./operation-register";

const entries: OperationRegisterEntry[] = [
  {
    accountId: "lucid-1",
    accountReference: 1,
    companyId: "lucid",
    companyName: "LUCID",
    dailyControlId: "control-1",
    destination: "NETO BROKER +",
    id: "entry-1",
    magnitudeInCents: 20_000,
    operatedOn: "2026-08-12",
    participantRole: "leader",
    phase: "Evaluacion",
  },
  {
    accountId: "lucid-1",
    accountReference: 1,
    companyId: "lucid",
    companyName: "LUCID",
    dailyControlId: "control-2",
    destination: "NETO BROKER -",
    id: "entry-2",
    magnitudeInCents: 5_000,
    operatedOn: "2026-08-12",
    participantRole: "leader",
    phase: "Evaluacion",
  },
  {
    accountId: "tradefy-1",
    accountReference: 1,
    companyId: "tradefy",
    companyName: "TRADEFY",
    dailyControlId: "control-1",
    destination: "NETO BROKER +",
    id: "entry-3",
    magnitudeInCents: 20_000,
    operatedOn: "2026-08-12",
    participantRole: "replica",
    phase: "Evaluacion",
  },
];

describe("vista de Registro de Operaciones", () => {
  it("no mezcla cuentas con la misma referencia de empresas distintas", () => {
    expect(entriesForAccount(entries, "lucid-1").map((entry) => entry.id)).toEqual([
      "entry-1",
      "entry-2",
    ]);
  });

  it("resume solo el resultado broker visible sin inventar TOTAL GANANCIA", () => {
    expect(summarizeBrokerEntries(entriesForAccount(entries, "lucid-1"))).toEqual({
      entryCount: 2,
      negativeInCents: 5_000,
      netInCents: 15_000,
      positiveInCents: 20_000,
    });
  });
});
