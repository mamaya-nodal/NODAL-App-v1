import { calculateDailyBalance } from "@/modules/control-diario/domain/balance-rules";
import type { AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { buildHomePerformance } from "@/modules/summary/domain/home-dashboard";
import { applyIndividualCommission } from "@/modules/summary/domain/individual-commission";
import { buildOperationalSummary } from "@/modules/summary/domain/operational-summary";

import { demoIndividualCommissionBps, type DemoAccount, type DemoControl, type DemoPeriod } from "./demo-fixture";

export type DemoAccountingInputKind =
  | "account_purchase_external"
  | "account_purchase_generated"
  | "broker_deposit_external"
  | "broker_deposit_wallet"
  | "broker_withdrawal_personal"
  | "broker_withdrawal_wallet"
  | "operation_result"
  | "payout_approved"
  | "payout_collected"
  | "wallet_contribution"
  | "wallet_withdrawal";

export type DemoAccountingInput = Readonly<{
  accountId?: string;
  amountInCents: number;
  id: string;
  kind: DemoAccountingInputKind;
  payoutId?: string;
}>;

const dates = { august: "2026-08-29", july: "2026-07-30" } as const;

function phaseFor(account: DemoAccount): OperationRegisterEntry["phase"] {
  if (account.stage === "Evaluation") return "Evaluacion";
  return account.stage === "Funded" ? "Primera vuelta" : "Segunda vuelta";
}

function appendControl(
  controls: DemoControl[],
  period: DemoPeriod,
  input: DemoAccountingInput,
  kind: "deposit" | "withdrawal" | "balance_update",
  originDestination: DemoControl["originDestination"],
) {
  const previousBalance = controls.at(-1)?.balanceAfterInCents ?? null;
  const calculated = kind === "balance_update"
    ? calculateDailyBalance(previousBalance, {
        balanceInCents: (previousBalance ?? 0) + input.amountInCents,
        kind,
      })
    : calculateDailyBalance(previousBalance, { amountInCents: input.amountInCents, kind });
  controls.push({
    balanceAfterInCents: calculated.balanceInCents,
    controlNumber: (controls.at(-1)?.controlNumber ?? 0) + 1,
    id: input.id,
    kind,
    movementInCents: kind === "balance_update" ? null : input.amountInCents,
    operatedOn: dates[period.id],
    operatingResultInCents: calculated.operatingResultInCents,
    originDestination,
  });
}

export function applyDemoAccountingInputs(
  period: DemoPeriod,
  inputs: readonly DemoAccountingInput[],
): DemoPeriod {
  const accounts = [...period.accounts];
  const controls = [...period.controls];
  const entries = [...period.entries];
  let fundingWithdrawals = [...period.fundingWithdrawals];
  let phaseWithdrawals = [...period.phaseWithdrawals];
  const walletMovements = [...period.walletMovements];

  for (const input of inputs) {
    if (input.kind === "account_purchase_external" || input.kind === "account_purchase_generated") {
      const sequence = accounts.length + 1;
      accounts.push({
        company: "Tradeify",
        externalId: `SIM-AUD-${period.id.toUpperCase()}-${sequence}`,
        fundsOrigin: input.kind === "account_purchase_external" ? "Aporte trader" : "Saldo generado",
        id: `${input.id}-account`,
        openedOn: dates[period.id].split("-").reverse().join("/"),
        periodLabel: period.label,
        priceInCents: input.amountInCents,
        resultInCents: 0,
        stage: "Evaluation",
        state: "virgin",
        stateOrigin: "automatic",
        trades: 0,
      });
      continue;
    }

    if (input.kind === "broker_deposit_external") {
      appendControl(controls, period, input, "deposit", "Aporte trader");
      continue;
    }
    if (input.kind === "broker_deposit_wallet") {
      appendControl(controls, period, input, "deposit", "Saldo billetera");
      continue;
    }
    if (input.kind === "broker_withdrawal_personal") {
      appendControl(controls, period, input, "withdrawal", "Retiro personal");
      continue;
    }
    if (input.kind === "broker_withdrawal_wallet") {
      appendControl(controls, period, input, "withdrawal", "Saldo billetera");
      continue;
    }
    if (input.kind === "operation_result") {
      const account = accounts.find((candidate) => candidate.id === input.accountId);
      if (!account) throw new Error("Elegí una cuenta válida para la operación.");
      appendControl(controls, period, input, "balance_update", null);
      entries.push({
        accountId: account.id,
        accountReference: Number(account.id.match(/(\d+)$/)?.[1] ?? accounts.indexOf(account) + 1),
        companyId: account.company.toLowerCase(),
        companyName: account.company,
        dailyControlId: input.id,
        destination: input.amountInCents >= 0 ? "NETO BROKER +" : "NETO BROKER -",
        id: `${input.id}-entry`,
        magnitudeInCents: Math.abs(input.amountInCents),
        operatedOn: dates[period.id],
        // El campo persiste por compatibilidad histórica; no participa del cálculo.
        participantRole: "leader",
        phase: phaseFor(account),
      });
      continue;
    }
    if (input.kind === "payout_approved") {
      const account = accounts.find((candidate) => candidate.id === input.accountId);
      if (!account) throw new Error("Elegí una cuenta válida para el payout.");
      if (account.state !== "closed" || account.stage === "Evaluation") {
        throw new Error("El payout debe pertenecer a una cuenta cerrada habilitada para retiros.");
      }
      fundingWithdrawals.push({
        accountId: account.id,
        amountInCents: input.amountInCents,
        approvedOn: dates[period.id],
        collectedOn: null,
        id: input.id,
      });
      const phase = phaseFor(account) as AccountPhaseWithdrawal["phase"];
      const currentWithdrawal = phaseWithdrawals.find((withdrawal) => withdrawal.accountId === account.id && withdrawal.phase === phase);
      phaseWithdrawals = [
        ...phaseWithdrawals.filter((withdrawal) => withdrawal !== currentWithdrawal),
        {
          accountId: account.id,
          phase,
          totalWithdrawalInCents: (currentWithdrawal?.totalWithdrawalInCents ?? 0) + input.amountInCents,
        },
      ];
      continue;
    }
    if (input.kind === "payout_collected") {
      if (!fundingWithdrawals.some((withdrawal) => withdrawal.id === input.payoutId && !withdrawal.collectedOn)) {
        throw new Error("El payout pendiente no existe o ya fue cobrado.");
      }
      fundingWithdrawals = fundingWithdrawals.map((withdrawal) => withdrawal.id === input.payoutId
        ? { ...withdrawal, collectedOn: dates[period.id] }
        : withdrawal);
      continue;
    }
    walletMovements.push({
      amountInCents: input.amountInCents,
      id: input.id,
      kind: input.kind === "wallet_contribution" ? "external_contribution" : "personal_withdrawal",
      occurredOn: dates[period.id],
      observation: "Simulación contable",
    });
  }

  const summary = applyIndividualCommission(buildOperationalSummary({
    accounts,
    controls,
    entries,
    fundingWithdrawals,
    opening: period.opening,
    phaseWithdrawals,
    walletMovements,
  }), demoIndividualCommissionBps);

  return {
    ...period,
    accounts,
    controls,
    entries,
    fundingWithdrawals,
    performance: buildHomePerformance(controls.map((control) => ({
      operatedOn: control.operatedOn,
      resultInCents: control.operatingResultInCents,
    }))),
    summary,
    walletMovements,
    phaseWithdrawals,
  };
}
