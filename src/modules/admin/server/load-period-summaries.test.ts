import { describe, expect, it, vi } from "vitest";
import { loadPeriodSummaries } from "./load-period-summaries";
import { buildOperationalSummary } from "@/modules/summary/domain/operational-summary";
import { buildConciliationBreakdown } from "@/modules/summary/domain/conciliation-breakdown";

vi.mock("@/modules/summary/server/individual-commission", () => ({ loadIndividualCommission: vi.fn(async () => null) }));

type Row = Record<string, unknown>;
function client(data: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(data[table] ?? [])];
      const query = {
        select() { return query; },
        in(key: string, values: readonly unknown[]) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        eq(key: string, value: unknown) { rows = rows.filter((row) => row[key] === value); return query; },
        order(key: string, options?: { ascending?: boolean }) {
          rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options?.ascending === false ? -1 : 1)); return query;
        },
        range(from: number, to: number) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
        then(resolve: (result: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return query;
    },
  } as unknown as Parameters<typeof loadPeriodSummaries>[0];
}

function fixture() {
  const legacy = {
    ...buildOperationalSummary({ accounts: [], controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [] }),
    accountStates: { closed: 10, live: 2, virgin: 0 },
    resultDetails: undefined,
    realizedGainInCents: 26_540, floatingInCents: 54_378, uncoveredBrokerResultInCents: 1_160,
    accumulatedResultInCents: -26_678, periodResultInCents: -26_678,
    capitalNetInCents: 563_000, brokerBalanceInCents: 536_322,
    positionExpectedInCents: 536_322, positionObservableInCents: 536_322,
  };
  const data: Record<string, Row[]> = {
    periods: [
      { id: "sep", workspace_id: "w", period_month: "2026-09-01", lifecycle_status: "closed", workspaces: { owner_user_id: "u" } },
      { id: "oct", workspace_id: "w", period_month: "2026-10-01", lifecycle_status: "open", workspaces: { owner_user_id: "u" } },
      { id: "nov", workspace_id: "w", period_month: "2026-11-01", lifecycle_status: "scheduled", workspaces: { owner_user_id: "u" } },
    ],
    accounts: ["a", "b"].map((id) => ({ id, period_id: "oct", state: "live", state_origin: "automatic" })),
    purchases: ["a", "b"].map((id) => ({ id: `purchase-${id}`, account_id: id, period_id: "sep", price_cents: 10_500, funds_origin: "Aporte trader" })),
    operation_entries: [16_314, 17_064].map((loss, i) => ({
      id: `entry-${i}`, period_id: "sep", account_id: i === 0 ? "a" : "b", phase: "Evaluacion",
      operated_on: "2026-10-02", participant_role: "leader", destination: "NETO BROKER -", magnitude_cents: loss,
    })),
    account_period_carryovers: [-26_814, -27_564].map((result, i) => ({
      id: `carry-${i}`, from_period_id: "sep", to_period_id: "oct", account_id: i === 0 ? "a" : "b",
      account_state: "live", lifetime_result_cents: result, purchase_price_cents: 10_500,
    })),
    period_closure_versions: [{ id: "closure", period_id: "sep", version: 1, summary_data: legacy }],
  };
  return { data, legacy };
}

describe("shared period summaries", () => {
  it("loads frozen history even when only the current period is requested", async () => {
    const { data } = fixture();
    const summaries = await loadPeriodSummaries(client(data), ["oct"]);
    expect([...summaries.keys()]).toEqual(["oct"]);
    const current = summaries.get("oct")!;
    expect(current.summary.brokerBalanceInCents).toBe(536_322);
    expect(current.summary.capitalNetInCents).toBe(563_000);
    expect(current.summary.periodResultInCents).toBe(0);
    expect(current.summary.accumulatedResultInCents).toBe(-26_678);
    expect(current.summary.resultDetails?.liveResultInCents).toBe(-54_378);
    expect(current.summary.resultDetails?.openingLiveResultInCents).toBe(-54_378);
    expect(current.summary.resultDetails?.verified).toBe(true);
    expect(current.summary.realizedReconciliationDifferenceInCents).toBe(0);
    const view = buildConciliationBreakdown(current.summary);
    expect(view.accumulated.total).toBe(-26_678);
    expect(view.gains.reconstructedTotal).toBe(0);
    expect(view.accumulated.lines.map((line) => line.valueInCents)).toEqual([26_540, -54_378, 0, 1_160, 0, 0]);
  });

  it("never recomputes a closed snapshot or applies today's commission to it", async () => {
    const { data, legacy } = fixture();
    const original = JSON.stringify(legacy);
    const summaries = await loadPeriodSummaries(client(data), ["sep", "oct"], { loadCommission: async () => 9999 });
    expect(summaries.get("sep")?.summary).toBe(legacy);
    expect(JSON.stringify(legacy)).toBe(original);
    expect(summaries.get("oct")?.summary.resultDetails?.verified).toBe(true);
  });

  it("missing carryover evidence is not presented as a verified zero", async () => {
    const { data } = fixture();
    data.account_period_carryovers.pop();
    const summaries = await loadPeriodSummaries(client(data), ["oct"]);
    const current = summaries.get("oct")!.summary;
    expect(current.resultDetails?.verified).toBe(false);
    expect(current.accumulatedResultInCents).toBe(-26_678);
    expect(buildConciliationBreakdown(current).gains.verified).toBe(false);
    expect(current.realizedReconciliationDifferenceInCents).not.toBe(0);
  });

  it("an empty request performs no reads", async () => {
    expect((await loadPeriodSummaries(client({}), [])).size).toBe(0);
  });
});
