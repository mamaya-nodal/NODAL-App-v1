import { expect, it } from "vitest";
import { parseRepairAction } from "./repair-actions";
const id = "11111111-1111-4111-8111-111111111111";
const request = { action: "approve_payout", periodId: id, parameters: { account_id: id, approved_on: "2026-11-06", amount_cents: 120000 } };
it("validates explicit inputs in cents and discards untrusted execution instructions", () => {
  expect(parseRepairAction({ ...request, parameters: { ...request.parameters, sql: "delete", ownerId: "other" } })).toEqual(request);
});
it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1200", 0])("rejects invalid payout money %s", (amount_cents) => {
  expect(() => parseRepairAction({ ...request, parameters: { ...request.parameters, amount_cents } })).toThrow();
});
it("rejects invalid dates", () => expect(() => parseRepairAction({ ...request, parameters: { ...request.parameters, approved_on: "2026-02-30" } })).toThrow());
it("cannot choose a database procedure", () => expect(() => parseRepairAction({ ...request, action: "admin_close_period" })).toThrow());
it("does not infer a burn", () => expect(() => parseRepairAction({ action: "coverage_members", periodId: id, parameters: { batch_id: id, account_ids: [id] } })).toThrow());
