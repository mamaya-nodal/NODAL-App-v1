import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import type { PeriodCloseReportSnapshot } from "@/modules/accounting/domain/period-close-report";
import { renderPeriodCloseReport } from "./render-period-close-report";

const snapshot: PeriodCloseReportSnapshot = {
  closure: { closedAt: "2026-10-02T22:00:00.000Z", id: "closure-1", status: "closed", version: 1 },
  desk: {
    name: "Mesa Alfred",
    rows: [{
      accountsClosed: 2,
      administratorBps: 3_000,
      administratorCommissionInCents: 120_000,
      billedInCents: 400_000,
      memberBps: 5_000,
      memberCommissionInCents: 200_000,
      memberName: "Martina Lagos",
      nodalBps: 2_000,
      nodalCommissionInCents: 80_000,
    }],
  },
  identities: [{
    accountCount: 2,
    gainInCents: 182_540,
    id: "identity-1",
    name: "Sebastián Mamaya",
    payoutsByCompany: [{ company: "LUCID", count: 1 }],
  }],
  operations: [{
    accountCount: 2,
    accounts: ["LFE05088021070010", "LFE05088021070011"],
    brokerAccount: "2211575",
    company: "LUCID",
    executionCount: 3,
    finalResultInCents: 182_540,
    identityName: "Sebastián Mamaya",
    instruments: ["NQ DEC26"],
    openedAt: "2026-09-30T15:43:06.000Z",
    phaseDay: "Evaluación D2",
  }],
  owner: { email: "alfred@example.com", id: "owner-1", name: "Alfred Mamaya" },
  period: {
    id: "period-1",
    modality: "real",
    month: "2026-09-01",
    operationalStartOn: "2026-09-07",
    scheduledCloseAt: "2026-10-02T22:00:00.000Z",
  },
  schemaVersion: 1,
  summary: {
    accountStates: { closed: 2, live: 1, virgin: 0 },
    brokerBalanceInCents: 3_184_020,
    commissionInCents: 63_889,
    commissionRateLabel: "35%",
    floatingInCents: 128_000,
    fundingPendingInCents: 200_000,
    positionObservableInCents: 4_009_020,
    realizedGainInCents: 182_540,
    traderGainInCents: 118_651,
    walletBalanceInCents: 625_000,
  },
};

describe("period close PDF", () => {
  it("renders the approved report format as a PDF", async () => {
    const pdf = await renderPeriodCloseReport(snapshot);
    if (process.env.WRITE_PERIOD_CLOSE_SAMPLE === "1") {
      const target = path.join(process.cwd(), "output", "pdfs", "cierre-periodo-runtime.pdf");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, pdf);
    }
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
