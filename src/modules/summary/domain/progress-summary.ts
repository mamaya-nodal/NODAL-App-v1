export type SummaryAccountState = "virgin" | "live" | "closed";

export type SummaryDailyControl = Readonly<{
  balanceInCents: number;
  kind: "deposit" | "withdrawal" | "balance_update";
  movementInCents: number | null;
  operatedOn: string;
  operatingResultInCents: number | null;
}>;

export type ProgressSummary = Readonly<{
  accountCount: number;
  accountStates: Readonly<Record<SummaryAccountState, number>>;
  brokerBalanceInCents: number | null;
  brokerBalanceUpdatedOn: string | null;
  controlCount: number;
  depositsInCents: number;
  operatingResultInCents: number;
  operationEntryCount: number;
  purchaseCostInCents: number;
  withdrawalsInCents: number;
}>;

export type HomeNextStep = Readonly<{
  description: string;
  href: "#compras" | "#control-diario";
  label: string;
  title: string;
}>;

type ProgressSummaryInput = Readonly<{
  accountStates: SummaryAccountState[];
  controls: SummaryDailyControl[];
  operationEntryCount: number;
  purchaseCostsInCents: number[];
}>;

export function buildProgressSummary({
  accountStates,
  controls,
  operationEntryCount,
  purchaseCostsInCents,
}: ProgressSummaryInput): ProgressSummary {
  const lastControl = controls.at(-1);

  return {
    accountCount: accountStates.length,
    accountStates: {
      closed: accountStates.filter((state) => state === "closed").length,
      live: accountStates.filter((state) => state === "live").length,
      virgin: accountStates.filter((state) => state === "virgin").length,
    },
    brokerBalanceInCents: lastControl?.balanceInCents ?? null,
    brokerBalanceUpdatedOn: lastControl?.operatedOn ?? null,
    controlCount: controls.length,
    depositsInCents: controls
      .filter((control) => control.kind === "deposit")
      .reduce((total, control) => total + (control.movementInCents ?? 0), 0),
    operatingResultInCents: controls.reduce(
      (total, control) => total + (control.operatingResultInCents ?? 0),
      0,
    ),
    operationEntryCount,
    purchaseCostInCents: purchaseCostsInCents.reduce(
      (total, amount) => total + amount,
      0,
    ),
    withdrawalsInCents: controls
      .filter((control) => control.kind === "withdrawal")
      .reduce((total, control) => total + (control.movementInCents ?? 0), 0),
  };
}

export function chooseHomeNextStep(summary: ProgressSummary): HomeNextStep {
  if (summary.accountCount === 0) {
    return {
      description:
        "La primera cuenta habilita la selección de empresa, líder y réplicas.",
      href: "#compras",
      label: "Registrar una compra",
      title: "Comenzá registrando una cuenta",
    };
  }

  if (summary.brokerBalanceInCents === null) {
    return {
      description:
        "El depósito inicial establece el saldo de referencia para calcular las operatorias.",
      href: "#control-diario",
      label: "Informar depósito inicial",
      title: "Establecé el saldo broker inicial",
    };
  }

  return {
    description:
      "Elegí empresa, cuenta líder, réplicas y fase antes del siguiente saldo broker.",
    href: "#control-diario",
    label: "Preparar próxima operación",
    title: "El espacio está listo para operar",
  };
}
