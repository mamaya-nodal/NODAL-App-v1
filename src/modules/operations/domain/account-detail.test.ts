import { describe, expect, it } from "vitest";

import type { OperationRegisterEntry } from "./operation-register";
import { summarizeAccountActivity, summarizeAccountPhases } from "./account-detail";

const entries: OperationRegisterEntry[] = [
  {
    accountId: "account-1", accountReference: 1, companyId: "lucid",
    companyName: "LUCID", dailyControlId: "control-1",
    destination: "NETO BROKER +", id: "entry-1", magnitudeInCents: 20_000,
    operatedOn: "2026-08-10", participantRole: "leader", phase: "Evaluacion",
  },
  {
    accountId: "account-1", accountReference: 1, companyId: "lucid",
    companyName: "LUCID", dailyControlId: "control-2",
    destination: "NETO BROKER -", id: "entry-2", magnitudeInCents: 5_000,
    operatedOn: "2026-08-12", participantRole: "replica", phase: "Primera vuelta",
  },
];

describe("detalle consultable de una cuenta", () => {
  it("resume fechas, fases y roles sin inferir réplicas", () => {
    expect(summarizeAccountActivity(entries)).toEqual({
      activePhaseCount: 2,
      firstOperatedOn: "2026-08-10",
      lastOperatedOn: "2026-08-12",
      leaderEntryCount: 1,
      replicaEntryCount: 1,
    });
  });

  it("conserva las seis fases y calcula solamente sus subtotales broker", () => {
    const phases = summarizeAccountPhases(entries);

    expect(phases).toHaveLength(6);
    expect(phases[0]).toMatchObject({
      broker: { netInCents: 20_000, positiveInCents: 20_000 },
      phase: "Evaluacion",
    });
    expect(phases[1]).toMatchObject({
      broker: { negativeInCents: 5_000, netInCents: -5_000 },
      phase: "Primera vuelta",
    });
    expect(phases[5].broker.entryCount).toBe(0);
  });
});
