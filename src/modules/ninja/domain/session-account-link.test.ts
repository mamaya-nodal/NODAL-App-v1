import { describe, expect, it } from "vitest";
import { resolveSessionAccountLink } from "./session-account-link";

const session = { connection_name: "Lucid", account_name: "LFE010", opened_at: "2026-09-30T15:43:15.469Z" };
const link = { account_id: "account-10", connection_name: "Lucid", external_account_name: "LFE010",
  first_seen_at: "2026-09-30T15:46:55.453Z", closed_at: null, life_id: null };
const purchases = [{ account_id: "account-10", purchased_on: "2026-09-30" }];

describe("late session account resolution", () => {
  it("links a trade before first observation without changing timestamps", () => {
    expect(resolveSessionAccountLink(session, [link], purchases, [])).toBe(link);
    expect(link.first_seen_at).toBe("2026-09-30T15:46:55.453Z");
  });
  it("allows the app to open days after the trade", () => {
    const late = { ...link, first_seen_at: "2026-10-03T15:00:00Z" };
    expect(resolveSessionAccountLink(session, [late], purchases, [])).toBe(late);
  });
  it("requires a purchase no later than the trade in the same period", () => {
    expect(resolveSessionAccountLink(session, [link], [], [])).toBeNull();
    for (const purchased_on of ["2026-10-01", "2026-08-30"]) {
      expect(resolveSessionAccountLink(session, [link], [{ ...purchases[0], purchased_on }], [])).toBeNull();
    }
  });
  it("uses Buenos Aires dates for late-night trades", () => {
    expect(resolveSessionAccountLink({ ...session, opened_at: "2026-09-30T01:00:00Z" }, [link], purchases, [])).toBeNull();
  });
  it("keeps a burned account only for trades before closure", () => {
    const burned = { ...link, closed_at: "2026-09-30T15:49:23Z" };
    expect(resolveSessionAccountLink(session, [burned], purchases, [])).toBe(burned);
    expect(resolveSessionAccountLink(session, [{ ...burned, closed_at: "2026-09-30T15:00:00Z" }], purchases, [])).toBeNull();
  });
  it("does not backdate reset or transition lives", () => {
    expect(resolveSessionAccountLink(session, [{ ...link, life_id: "reset-life" }], purchases, [])).toBeNull();
    for (const event_type of ["reset", "reset_after_burn", "phase_transition", "unknown"]) {
      expect(resolveSessionAccountLink(session, [link], purchases, [{ connection_name: "Lucid", to_account_name: "LFE010", event_type }])).toBeNull();
    }
  });
  it("never chooses between ambiguous links", () => {
    expect(resolveSessionAccountLink(session, [link, { ...link, account_id: "other" }], purchases, [])).toBeNull();
    const before = { ...link, first_seen_at: "2026-09-29T00:00:00Z" };
    expect(resolveSessionAccountLink(session, [before, { ...before, account_id: "other" }], purchases, [])).toBeNull();
  });
  it("preserves normal resolution for successive lives", () => {
    const old = { ...link, first_seen_at: "2026-09-29T00:00:00Z", closed_at: "2026-09-30T16:00:00Z", life_id: "old" };
    expect(resolveSessionAccountLink(session, [old, { ...link, life_id: "new", first_seen_at: "2026-09-30T17:00:00Z" }], [], [])).toBe(old);
  });
  it("does not mix connections and rejects invalid dates", () => {
    expect(resolveSessionAccountLink({ ...session, connection_name: "Other" }, [link], purchases, [])).toBeNull();
    expect(resolveSessionAccountLink({ ...session, opened_at: "invalid" }, [link], purchases, [])).toBeNull();
  });
  it("allows an observation delayed by floating balance, not a life transition", () => {
    const observation = { connection_name: "Lucid", to_account_name: "LFE010", event_type: "review_disappearance",
      from_account_name: null, from_life_id: null, to_life_id: null };
    expect(resolveSessionAccountLink(session, [link], purchases, [observation])).toBe(link);
    expect(resolveSessionAccountLink(session, [link], purchases, [{ ...observation, from_life_id: "old-life" }])).toBeNull();
  });
});
