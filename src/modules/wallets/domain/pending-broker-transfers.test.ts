import { expect, it } from "vitest";
import { orderPendingBrokerTransfers, pendingBrokerDifference } from "./pending-broker-transfers";

it("keeps the October pending difference alongside the November increase, newest first", () => {
  const old = { eventId: "october", observedAt: "2026-10-30T15:18:02Z", balanceInCents: 805858, expectedBalanceInCents: 911006 };
  const current = { eventId: "november", observedAt: "2026-11-13T19:51:04Z", balanceInCents: 993008, expectedBalanceInCents: 137908 };
  const input = [old, current];
  expect(orderPendingBrokerTransfers(input)).toEqual([current, old]);
  expect(input).toEqual([old, current]);
  expect(pendingBrokerDifference(old)).toBe(-105148);
  expect(pendingBrokerDifference(current)).toBe(855100);
});

it("does not merge separate equal-amount movements and does not repeat the same event", () => {
  const item = { eventId: "a", observedAt: "2026-11-13T19:00:00Z", balanceInCents: 20000, expectedBalanceInCents: 10000 };
  expect(orderPendingBrokerTransfers([item, { ...item, eventId: "b" }, item]).map((row) => row.eventId)).toEqual(["a", "b"]);
});

it("does not invent a historical amount by using today's balance when its baseline is missing", () => {
  expect(pendingBrokerDifference({ eventId: "old", observedAt: "2026-10-30T15:18:02Z", balanceInCents: 805858 })).toBeNull();
});
