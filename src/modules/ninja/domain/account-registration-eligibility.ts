import { ninjaAccountRegistrationKey } from "./account-registration-key";

export type NinjaRegistrationLink = Readonly<{
  accountName: string;
  connectionName: string;
  connectorId: string | null;
  linkedAt: string;
}>;

export type NinjaRegistrationTransition = Readonly<{
  connectorId: string;
  connectionName: string;
  eventType: string;
  occurredAt: string;
  resolutionStatus: string;
  toAccountName: string | null;
}>;

const RESET_EVENTS = new Set(["reset", "reset_after_burn"]);
const ACCEPTED_RESOLUTIONS = new Set(["automatic", "confirmed"]);

export function registeredNinjaAccountKeys(
  links: readonly NinjaRegistrationLink[],
  transitions: readonly NinjaRegistrationTransition[],
): Set<string> {
  const latestLinkByKey = new Map<string, string>();
  for (const link of links) {
    if (!link.connectorId) continue;
    const key = ninjaAccountRegistrationKey(link.connectorId, link.connectionName, link.accountName);
    const prior = latestLinkByKey.get(key);
    if (!prior || prior < link.linkedAt) latestLinkByKey.set(key, link.linkedAt);
  }

  const latestResetByKey = new Map<string, string>();
  for (const transition of transitions) {
    if (!transition.toAccountName
      || !RESET_EVENTS.has(transition.eventType)
      || !ACCEPTED_RESOLUTIONS.has(transition.resolutionStatus)) continue;
    const key = ninjaAccountRegistrationKey(
      transition.connectorId,
      transition.connectionName,
      transition.toAccountName,
    );
    const prior = latestResetByKey.get(key);
    if (!prior || prior < transition.occurredAt) latestResetByKey.set(key, transition.occurredAt);
  }

  return new Set([...latestLinkByKey].flatMap(([key, linkedAt]) => {
    const resetAt = latestResetByKey.get(key);
    return !resetAt || linkedAt >= resetAt ? [key] : [];
  }));
}
