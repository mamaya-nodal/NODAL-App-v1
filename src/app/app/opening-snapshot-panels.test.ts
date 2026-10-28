import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { PeriodOpeningRecord } from "@/modules/summary/domain/opening-snapshot";

import { OpeningSnapshotCompact } from "./opening-snapshot-panels";

const opening: PeriodOpeningRecord = {
  batches: [],
  brokerBalanceInCents: 1_047_692,
  closedAccountsReference: 0,
  contributedCapitalInCents: 1_139_962,
  cutoverDate: "2026-10-24",
  floatingInCents: 0,
  fundedAccounts: 2,
  fundingPendingInCents: 0,
  id: "opening-1",
  inferredResultInCents: 0,
  liveEvaluationAccounts: 1,
  mode: "zero",
  personalWithdrawalsInCents: 0,
  revisionNumber: 1,
  virginAccounts: 0,
  walletBalanceInCents: 0,
  wallets: [],
};

describe("compact opening reference", () => {
  it("keeps the confirmed opening data available outside Home", () => {
    const html = renderToStaticMarkup(createElement(OpeningSnapshotCompact, {
      opening,
      periodId: "period-1",
      revisionEligible: true,
      revisionStatus: null,
    }));

    expect(html).toContain("PUNTO DE PARTIDA");
    expect(html).toContain("Inicio desde cero");
    expect(html).toContain("24/10/2026");
    expect(html).toContain("Capital neto inicial");
    expect(html).toContain("Resultado previo");
    expect(html).toContain("Cuentas vigentes");
    expect(html).toContain("Solicitar edición");
  });
});
