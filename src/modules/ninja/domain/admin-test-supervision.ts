import { classifyNinjaAccount } from "./account-classification";
import { isNinjaConnectionActive } from "./connection-access";
import type { NinjaAccountSnapshot } from "./ingestion-payload";

export type NinjaSupervisionConnection = Readonly<{
  accountCount: number;
  name: string;
  status: "approved" | "isolated" | null;
}>;

export type NinjaSupervisionLink = Readonly<{
  accountId: string;
  accountName: string;
  closedAt: string | null;
  company: string;
  connectionName: string;
  firstSeenAt: string;
  periodMonth: string;
  phase: "Evaluation" | "Funded" | "Live" | null;
  state: string;
}>;

export type NinjaSupervisionSession = Readonly<{
  accountName: string;
  closingBalance: number | null;
  connectionName: string;
  direction: "Long" | "Short" | null;
  executionCount: number;
  flatAt: string | null;
  id: number;
  instruments: string[];
  openedAt: string;
  openingBalance: number | null;
  quantity: number;
  result: number | null;
  settledAt: string | null;
  status: "open" | "settling" | "closed";
}>;

export type NinjaSupervisionBatch = Readonly<{
  accountingMode: "shadow" | "active";
  accountingStatus: "blocked" | "shadow_ready" | "committed";
  blockingReason: string | null;
  brokerAccount: string | null;
  brokerResultInCents: number;
  company: string | null;
  distributedInCents: number;
  id: string;
  openedAt: string;
  operatedOn: string | null;
  phase: string | null;
  propAccounts: Array<{
    accountId: string;
    accountName: string;
    allocatedBrokerResultInCents: number;
  }>;
  roundingDifferenceInCents: number;
  settledAt: string | null;
  status: "ready" | "unmatched" | "conflict";
}>;

export type AdminNinjaTestSupervision = Readonly<{
  batches: NinjaSupervisionBatch[];
  connections: NinjaSupervisionConnection[];
  connector: {
    id: string;
    lastSeenAt: string | null;
    pairedAt: string;
    status: "active";
    version: string;
  } | null;
  currentPeriod: { id: string; month: string } | null;
  inventory: {
    accounts: NinjaAccountSnapshot[];
    observedAt: string | null;
  };
  links: NinjaSupervisionLink[];
  sessions: NinjaSupervisionSession[];
  user: {
    accessState: "active" | "revoked";
    email: string;
    id: string;
    name: string | null;
  };
}>;

export type NinjaTestReadinessCheck = Readonly<{
  detail: string;
  id: "period" | "connector" | "connections" | "accounts" | "links";
  label: string;
  ok: boolean;
}>;

function accountKey(connectionName: string, accountName: string) {
  return `${connectionName}\u0000${accountName}`;
}

export function deriveNinjaTestReadiness(
  data: AdminNinjaTestSupervision,
  nowInMilliseconds = Date.now(),
) {
  const observedAt = data.inventory.observedAt ?? data.connector?.lastSeenAt ?? null;
  const isolatedConnections = new Set(
    data.connections
      .filter((connection) => connection.status === "isolated")
      .map((connection) => connection.name),
  );
  const classified = data.inventory.accounts
    .filter((account) => isNinjaConnectionActive(account.connectionName, isolatedConnections))
    .map((account) => ({
    account,
    detected: classifyNinjaAccount(
      account,
      observedAt ?? new Date(nowInMilliseconds).toISOString(),
    ),
  }));
  const props = classified.filter((item) => item.detected.type === "prop");
  const brokers = classified.filter((item) => item.detected.type === "broker");
  const linked = new Set(
    data.links.filter((link) => link.closedAt === null)
      .map((link) => accountKey(link.connectionName, link.accountName)),
  );
  const missingLinks = props.filter(
    ({ account }) => !linked.has(accountKey(account.connectionName, account.accountName)),
  );
  const connectorIsOnline = Boolean(
    data.connector?.lastSeenAt &&
      nowInMilliseconds - Date.parse(data.connector.lastSeenAt) <= 60_000,
  );
  const observedConnections = new Set(
    data.inventory.accounts.map((account) => account.connectionName),
  );
  const activeConnections = [...observedConnections].filter(
    (connectionName) => isNinjaConnectionActive(connectionName, isolatedConnections),
  );

  const checks: NinjaTestReadinessCheck[] = [
    {
      detail: data.currentPeriod ? "Período actual preparado" : "Falta abrir el período actual",
      id: "period",
      label: "Período",
      ok: data.currentPeriod !== null,
    },
    {
      detail: connectorIsOnline
        ? `En línea · versión ${data.connector?.version}`
        : data.connector
          ? "Conector vinculado, sin señal reciente"
          : "Ivo debe vincular el conector desde su PC",
      id: "connector",
      label: "Conector",
      ok: connectorIsOnline,
    },
    {
      detail: activeConnections.length > 0
        ? `${activeConnections.length} conexiones activas${isolatedConnections.size > 0 ? ` · ${isolatedConnections.size} aisladas` : ""}`
        : "Todavía no hay conexiones activas",
      id: "connections",
      label: "Conexiones",
      ok: activeConnections.length > 0,
    },
    {
      detail: brokers.length === 1 && props.length > 0
        ? `1 broker + ${props.length} prop`
        : `${brokers.length} broker + ${props.length} prop detectadas`,
      id: "accounts",
      label: "Cuentas",
      ok: brokers.length === 1 && props.length > 0,
    },
    {
      detail: props.length > 0 && missingLinks.length === 0
        ? `${props.length} cuentas prop incorporadas`
        : missingLinks.length > 0
          ? `${missingLinks.length} cuentas prop pendientes de incorporar`
          : "Todavía no hay cuentas prop para incorporar",
      id: "links",
      label: "Registro",
      ok: props.length > 0 && missingLinks.length === 0,
    },
  ];

  return {
    brokers,
    checks,
    props,
    ready: data.user.accessState === "active" && checks.every((check) => check.ok),
  };
}
