import { buildNinjaLiveBrokerBalance, type NinjaInventoryView } from "./live-broker-balance";
import type { NinjaBalanceTelemetryEvent } from "./trade-telemetry";

export type ClaimedBrokerObservation = Readonly<{
  claimedAt: string;
  latestInventoryAt: string | null;
  sample: NinjaBalanceTelemetryEvent;
}>;

/** A claim must not wait for a changed balance to trigger another inventory.
 * Use the original received observation until the next post-claim inventory.
 * A newer inventory, including an empty/disconnected one, always takes over. */
export function buildBrokerBalanceAfterClaim(
  inventories: readonly NinjaInventoryView[],
  claims: readonly ClaimedBrokerObservation[],
) {
  const recovered: NinjaInventoryView[] = claims.flatMap(({ claimedAt, latestInventoryAt, sample }) => {
    if (!Number.isFinite(Date.parse(claimedAt)) || !Number.isFinite(Date.parse(sample.occurredAt))
      || (latestInventoryAt !== null && Date.parse(latestInventoryAt) >= Date.parse(claimedAt))) return [];
    return [{
      observed_at: sample.occurredAt,
      accounts: [{ ...sample, connectionStatus: "Connected" }],
    }];
  });
  return buildNinjaLiveBrokerBalance([...inventories, ...recovered]);
}

export type PendingOpeningBrokerAccount = Readonly<{
  accountName: string;
  balanceInCents: number | null;
  connectionName: string;
  observedAt: string;
  physicalConnectorId: string;
}>;
