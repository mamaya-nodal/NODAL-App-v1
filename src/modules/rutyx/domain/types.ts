export type RutyxCompanyCode = "LUCID" | "FTMO" | "TRADEIFY";

export type RutyxStrategy = Readonly<{
  company: RutyxCompanyCode;
  enabled: boolean;
  id: string;
  name: string;
}>;

export type RutyxContext = Readonly<{
  id: string;
  label: string;
  phase: "eval" | "funded";
  rootNodeId: string;
  strategyId: string;
}>;

export type RutyxOperation = Readonly<{
  brokerInstrument: string;
  coverageContractsPerAccount: number;
  fundingInstrument: string;
  nodeId: string;
  outcomes: readonly Readonly<{
    brokerNet: number;
    fundingNet: number;
    key: "SL" | "TP";
    nextKind: string;
    nextNodeId: string;
    nextStage: string;
  }>[];
  routeContractsPerAccount: number;
  session: number;
  slPips: number;
  stage: string;
  tpPips: number;
}>;

export type RutyxAccount = Readonly<{
  company: string;
  externalName: string;
  id: string;
  identityName: string | null;
  label: string;
  state: string;
}>;

export type RutyxRouteState = Readonly<{
  accountId: string;
  brokerRatio: number;
  contextId: string;
  coverageContractsPerAccount: number;
  fundingAccountCount: number;
  groupId: string;
  id: string;
  nodeId: string;
  phase: "eval" | "funded";
  revision: number;
  routeContractsPerAccount: number;
  strategyId: string;
}>;
