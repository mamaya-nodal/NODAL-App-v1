export function ninjaAccountRegistrationKey(
  connectorId: string,
  connectionName: string,
  accountName: string,
): string {
  return `${connectorId.trim()}\u0000${connectionName.trim()}\u0000${accountName.trim()}`;
}
