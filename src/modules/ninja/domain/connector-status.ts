export type ConnectorScopeStatus = Readonly<{
  identityId: string | null;
  isOnline: boolean;
  status: string;
}>;

export function effectiveConnectorSignal(
  connectors: readonly ConnectorScopeStatus[],
  brokerDetected: boolean,
) {
  const activeConnectors = connectors.filter((connector) => connector.status === "active");
  return {
    linked: activeConnectors.length > 0,
    online: brokerDetected && activeConnectors.some((connector) => connector.isOnline),
  };
}
