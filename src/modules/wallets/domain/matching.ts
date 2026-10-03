export type WalletEvidence = { wallet_id: string; direction: string; amount_cents: number; occurred_at: string };
export type WalletMovement = { id: string; wallet_id: string; destination_wallet_id: string | null; kind: string; amount_cents: number; fee_cents: number; occurred_on: string };
export function evidenceDate(occurredAt: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(occurredAt));
}
export function movementMatches(evidence: WalletEvidence, movement: WalletMovement): boolean {
  const destination = movement.destination_wallet_id === evidence.wallet_id;
  if (!destination && movement.wallet_id !== evidence.wallet_id) return false;
  const direction = destination || ["external_contribution", "prior_pending_collection", "broker_to_wallet"].includes(movement.kind) ? "in" : "out";
  const amount = destination || movement.kind === "broker_to_wallet" ? movement.amount_cents - movement.fee_cents : movement.amount_cents;
  return amount > 0 && direction === evidence.direction && amount === evidence.amount_cents && movement.occurred_on === evidenceDate(evidence.occurred_at);
}
