import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";

export const NINJA_STATUS_EVENT = "nodal:ninja-status";

export type NinjaStatusEventDetail = Readonly<{
  identityReviewRevision?: string | null;
  inventoryRevision: string | null;
  linked: boolean;
  liveBrokerBalance: NinjaLiveBrokerBalance | null;
  online: boolean;
}>;
