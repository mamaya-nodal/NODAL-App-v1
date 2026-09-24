export type OpeningEligibilityInput = Readonly<{
  accountCount: number;
  dailyControls: ReadonlyArray<Readonly<{
    controlNumber: number;
    kind: string;
    originDestination: string | null;
    source: string;
    sourceEventKey: string | null;
  }>>;
  fundingWithdrawalCount: number;
  hasOpeningSnapshot: boolean;
  operationEntryCount: number;
  walletMovementCount: number;
}>;

export function isProvisionalNinjaOpeningControl(
  control: OpeningEligibilityInput["dailyControls"][number],
): boolean {
  return control.controlNumber === 1
    && control.kind === "deposit"
    && control.originDestination === "Aporte trader"
    && control.source === "ninjatrader"
    && control.sourceEventKey?.startsWith("ninja-balance:") === true;
}

export function canConfigurePeriodOpening(input: OpeningEligibilityInput): boolean {
  const hasOnlyProvisionalBrokerOpening = input.dailyControls.length === 0
    || (input.dailyControls.length === 1 && isProvisionalNinjaOpeningControl(input.dailyControls[0]));

  return !input.hasOpeningSnapshot
    && input.accountCount === 0
    && hasOnlyProvisionalBrokerOpening
    && input.operationEntryCount === 0
    && input.walletMovementCount === 0
    && input.fundingWithdrawalCount === 0;
}
