import { expect, it } from "vitest";
import { repairChanges, repairSummary } from "./repair-summary";
it("formats money and omits internal identifiers", () => {
  const text = repairSummary({ wallet_id: "private-id", fee_cents: 1500, amount_cents: 178446 }).join(" ");
  expect(text).toContain("15,00");
  expect(text).toContain("1.784,46");
  expect(text).not.toContain("private-id");
  expect(text).not.toContain("_cents");
});
it("only displays approved before and after fields", () => {
  const text = repairChanges([{ before: { balance_after_cents: 10000, access_token: "secret" }, after: { balance_after_cents: 9000, access_token: "new-secret" } }]).join(" ");
  expect(text).toContain("100,00");
  expect(text).toContain("90,00");
  expect(text).not.toContain("secret");
});
