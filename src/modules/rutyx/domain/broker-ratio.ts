export type BrokerRatioInput = Readonly<{
  coverageContractsPerAccount: number;
  fundingAccountCount: number;
  routeContractsPerAccount: number;
}>;

export function calculateBrokerRatio(input: BrokerRatioInput): number {
  const values = [
    input.coverageContractsPerAccount,
    input.fundingAccountCount,
    input.routeContractsPerAccount,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Las cantidades del ratio broker deben ser mayores que cero.");
  }
  return -((input.coverageContractsPerAccount * input.fundingAccountCount)
    / input.routeContractsPerAccount);
}

export function formatBrokerRatio(value: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(value);
}
