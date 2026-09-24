export type ConnectorScopeStatus = Readonly<{
  identityId: string | null;
  isOnline: boolean;
  status: string;
}>;

export function principalConnectorSignal(connectors: readonly ConnectorScopeStatus[]) {
  const principal = connectors.find((connector) => connector.identityId === null);
  return {
    linked: principal?.status === "active",
    online: Boolean(principal?.isOnline && principal.status === "active"),
  };
}
