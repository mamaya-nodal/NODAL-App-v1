import type { NinjaAccountSnapshot } from "./ingestion-payload";

export type DetectedNinjaAccount = Readonly<{
  accountSizeInCents: number | null;
  accountName: string;
  company: string | null;
  companyCode: string | null;
  connectionName: string;
  firstSeenAt: string;
  phase: "Evaluation" | "Funded" | "Live" | null;
  product: string | null;
  suggestedPurchaseDate: string;
  type: "prop" | "broker" | "simulator" | "unknown";
}>;

type PropAccountRule = Readonly<{
  accountSizeInCents: number;
  company: string;
  companyCode: string;
  pattern: RegExp;
  phase: NonNullable<DetectedNinjaAccount["phase"]>;
  product: string | null;
}>;

// Los prefijos más específicos deben evaluarse primero. Solo se incluyen
// nomenclaturas confirmadas en la matriz vigente.
const PROP_ACCOUNT_RULES: readonly PropAccountRule[] = [
  { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", pattern: /^LMXF\d+$/, phase: "Funded", product: "MAXX" },
  { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", pattern: /^LMXL\d+$/, phase: "Live", product: "MAXX" },
  { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", pattern: /^LMX\d+$/, phase: "Evaluation", product: "MAXX" },
  { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", pattern: /^LFE\d+$/, phase: "Evaluation", product: "Flex" },
  { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", pattern: /^LFF\d+$/, phase: "Funded", product: "Flex" },
  { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", pattern: /^LFL\d+$/, phase: "Live", product: "Flex" },
  { accountSizeInCents: 5_000_000, company: "My Funded Futures", companyCode: "MFF", pattern: /^MFFUEVRPD[A-Z0-9]+$/, phase: "Evaluation", product: "Rapid EOD" },
  { accountSizeInCents: 5_000_000, company: "My Funded Futures", companyCode: "MFF", pattern: /^MFFUSFREOD[A-Z0-9]+$/, phase: "Funded", product: "Rapid EOD" },
  { accountSizeInCents: 5_000_000, company: "Topstep", companyCode: "TOPSTEP", pattern: /^50KTC-V2-[A-Z0-9-]+$/, phase: "Evaluation", product: "Trading Combine" },
  { accountSizeInCents: 5_000_000, company: "Topstep", companyCode: "TOPSTEP", pattern: /^EXPRESS-V2-CT-[A-Z0-9-]+$/, phase: "Funded", product: "Express" },
  { accountSizeInCents: 5_000_000, company: "Topstep", companyCode: "TOPSTEP", pattern: /^TOPX[A-Z0-9-]+$/, phase: "Live", product: null },
  { accountSizeInCents: 5_000_000, company: "Funded Futures Family", companyCode: "FFF", pattern: /^FFFUNDED\d{6}$/, phase: "Funded", product: "Prime 50K" },
  { accountSizeInCents: 5_000_000, company: "Funded Futures Family", companyCode: "FFF", pattern: /^FFF\d{6}$/, phase: "Evaluation", product: "Prime 50K" },
  // El alcance aprobado por el usuario para esta nomenclatura es FTMO Futures
  // Growth 50K. Funded y Live permanecen pendientes de ejemplos reales.
  { accountSizeInCents: 5_000_000, company: "FTMO", companyCode: "FTMO", pattern: /^FTMO\d+$/, phase: "Evaluation", product: "Growth" },
  { accountSizeInCents: 5_000_000, company: "Tradeify", companyCode: "TRADEFY", pattern: /^FTDFYSLX50[A-Z0-9-]*$/, phase: "Funded", product: "Select Flex" },
  { accountSizeInCents: 5_000_000, company: "Tradeify", companyCode: "TRADEFY", pattern: /^TDFYSL50[A-Z0-9-]*$/, phase: "Evaluation", product: "Select" },
  { accountSizeInCents: 5_000_000, company: "Take Profit Trader", companyCode: "TPT", pattern: /^TAKEPROFITPRO[A-Z0-9-]*$/, phase: "Funded", product: "PRO" },
  { accountSizeInCents: 5_000_000, company: "Take Profit Trader", companyCode: "TPT", pattern: /^TAKEPROFIT[A-Z0-9-]*$/, phase: "Evaluation", product: null },
];

function dateInBuenosAires(isoDate: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires", year: "numeric",
  }).formatToParts(new Date(isoDate));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function hasApprovedAutomaticRiskRule(account: DetectedNinjaAccount) {
  return account.type === "prop"
    && (account.companyCode !== "FTMO" || account.product === "Growth");
}

export function classifyNinjaAccount(account: NinjaAccountSnapshot, firstSeenAt: string): DetectedNinjaAccount {
  const name = account.accountName.trim().toUpperCase();
  const common = { accountName: account.accountName, connectionName: account.connectionName, firstSeenAt, suggestedPurchaseDate: dateInBuenosAires(firstSeenAt) };

  if (/^SIM(?:\d+|BROKER)$/.test(name) || account.connectionName.toLowerCase().includes("simulated"))
    return { ...common, accountSizeInCents: null, company: null, companyCode: null, phase: null, product: null, type: "simulator" };

  const rule = PROP_ACCOUNT_RULES.find((candidate) => candidate.pattern.test(name));
  if (rule) return { ...common, accountSizeInCents: rule.accountSizeInCents, company: rule.company, companyCode: rule.companyCode, phase: rule.phase, product: rule.product, type: "prop" };

  // Tradeify Live también usa números cortos. Sin evidencia adicional es
  // indistinguible de una cuenta broker y no debe generar una compra automática.
  if (/^\d+$/.test(name)) return { ...common, accountSizeInCents: null, company: null, companyCode: null, phase: null, product: null, type: "broker" };
  return { ...common, accountSizeInCents: null, company: null, companyCode: null, phase: null, product: null, type: "unknown" };
}
