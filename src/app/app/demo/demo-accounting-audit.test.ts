import { describe, expect, it } from "vitest";

import { applyDemoAccountingInputs, type DemoAccountingInput } from "./demo-accounting-audit";
import { augustDemo } from "./demo-fixture";

const liveAccount = augustDemo.accounts.find((account) => account.state === "live")!;
const payoutAccount = augustDemo.accounts.find((account) => account.state === "closed" && account.stage !== "Evaluation")!;

function input(
  kind: DemoAccountingInput["kind"],
  amountInCents: number,
  extra: Pick<DemoAccountingInput, "accountId" | "payoutId"> = {},
): DemoAccountingInput {
  return { amountInCents, id: `august-${kind}`, kind, ...extra };
}

function expectReconciled(period: ReturnType<typeof applyDemoAccountingInputs>) {
  expect(period.summary.positionDifferenceInCents).toBe(0);
  expect(period.summary.realizedReconciliationDifferenceInCents).toBe(0);
}

describe("demo accounting audit", () => {
  it("keeps broker deposits and withdrawals out of the operating result", () => {
    const period = applyDemoAccountingInputs(augustDemo, [
      input("broker_deposit_external", 10_000),
      input("broker_withdrawal_wallet", 4_000),
    ]);

    expect(period.summary.brokerBalanceInCents).toBe((augustDemo.summary.brokerBalanceInCents ?? 0) + 6_000);
    expect(period.summary.capitalNetInCents).toBe(augustDemo.summary.capitalNetInCents + 10_000);
    expect(period.summary.periodResultInCents).toBe(augustDemo.summary.periodResultInCents);
    expectReconciled(period);
  });

  it("applies an account operation to broker result and floating without distributing it", () => {
    const period = applyDemoAccountingInputs(augustDemo, [
      input("operation_result", 10_000, { accountId: liveAccount.id }),
    ]);

    expect(period.summary.periodResultInCents).toBe(augustDemo.summary.periodResultInCents + 10_000);
    expect(period.summary.floatingInCents).toBe(augustDemo.summary.floatingInCents - 10_000);
    expect(period.entries.filter((entry) => entry.dailyControlId === "august-operation_result")).toHaveLength(1);
    expectReconciled(period);
  });

  it("separates payout approval from collection", () => {
    const approved = applyDemoAccountingInputs(augustDemo, [
      input("payout_approved", 20_000, { accountId: payoutAccount.id }),
    ]);
    expect(approved.summary.fundingPendingInCents).toBe(augustDemo.summary.fundingPendingInCents + 20_000);
    expect(approved.summary.walletBalanceInCents).toBe(augustDemo.summary.walletBalanceInCents);
    expectReconciled(approved);

    const pending = augustDemo.fundingWithdrawals.find((withdrawal) => !withdrawal.collectedOn)!;
    const collected = applyDemoAccountingInputs(augustDemo, [
      input("payout_collected", pending.amountInCents, { payoutId: pending.id }),
    ]);
    expect(collected.summary.fundingPendingInCents).toBe(0);
    expect(collected.summary.walletBalanceInCents).toBe(augustDemo.summary.walletBalanceInCents + pending.amountInCents);
    expectReconciled(collected);
  });

  it("reconciles account purchases and wallet movements through the real summary", () => {
    const period = applyDemoAccountingInputs(augustDemo, [
      input("wallet_contribution", 30_000),
      input("account_purchase_generated", 8_000),
      input("wallet_withdrawal", 4_000),
    ]);

    expect(period.summary.walletBalanceInCents).toBe(augustDemo.summary.walletBalanceInCents + 18_000);
    expect(period.summary.virginPriceInCents).toBe(augustDemo.summary.virginPriceInCents + 8_000);
    expect(period.summary.capitalNetInCents).toBe(augustDemo.summary.capitalNetInCents + 26_000);
    expectReconciled(period);
  });
});
