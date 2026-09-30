type Link = Readonly<{
  account_id: string;
  connection_name: string;
  external_account_name: string;
  first_seen_at: string;
  closed_at: string | null;
  life_id: string | null;
}>;

type Session = Readonly<{ connection_name: string; account_name: string; opened_at: string }>;
type Purchase = Readonly<{ account_id: string; purchased_on: string }>;
type Change = Readonly<{ connection_name: string; to_account_name: string | null; event_type: string;
  from_account_name?: string | null; from_life_id?: string | null; to_life_id?: string | null }>;

/** first_seen_at is an observation, not the economic start of an initial account.
 * Never extrapolate a reset/transition life backwards or choose between duplicate links.
 * Inputs must all be scoped to the same authenticated connector by the caller.
 */
export function resolveSessionAccountLink<T extends Link>(
  session: Session,
  links: readonly T[],
  purchases: readonly Purchase[],
  changes: readonly Change[],
): T | null {
  const openedAt = Date.parse(session.opened_at);
  if (!Number.isFinite(openedAt)) return null;
  const matching = links.filter((link) => link.connection_name === session.connection_name &&
    link.external_account_name === session.account_name);
  const eligible = matching.filter((link) => Date.parse(link.first_seen_at) <= openedAt &&
    (link.closed_at === null || Date.parse(link.closed_at) >= openedAt));
  if (eligible.length === 1) return eligible[0];
  if (eligible.length > 1 || matching.length !== 1) return null;
  const link = matching[0];
  if (!Number.isFinite(Date.parse(link.first_seen_at)) || Date.parse(link.first_seen_at) <= openedAt ||
    link.life_id !== null || (link.closed_at !== null && !(Date.parse(link.closed_at) >= openedAt))) return null;
  // A later life may have the same external name even if its older link is absent.
  if (changes.some((change) => change.connection_name === session.connection_name &&
    change.to_account_name === session.account_name &&
    change.event_type !== "new_account" &&
    !(change.event_type === "review_disappearance" && change.from_account_name === null &&
      change.from_life_id === null && change.to_life_id === null))) return null;
  const purchase = purchases.find((row) => row.account_id === link.account_id);
  const operatedOn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(openedAt));
  // Do not retroactively assign an operation before purchase or in a different period.
  if (!purchase || purchase.purchased_on > operatedOn ||
    purchase.purchased_on.slice(0, 7) !== operatedOn.slice(0, 7)) return null;
  return link;
}
