import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildInvestigationContext } from "./repair-tools";

it("turns a pending broker event into actionable evidence", () => {
  const context = buildInvestigationContext({
    accounts: [{ id: "account", period_id: "period", reference_number: 1, state: "live", company_id: "company", links: [] }],
    assignments: [], companies: [{ id: "company", display_name: "Lucid" }], identities: [],
    brokerEvents: [{ id: "event", balance_cents: 765112, observed_at: "2026-11-09T12:00:00Z", source_event_id: "ninja-preoperation:test", source_accounts: [{ expectedBalanceInCents: 1000000 }], status: "pending" }],
    periods: [{ id: "period" }], wallets: [{ id: "wallet", name: "Binance", balance_cents: 300000 }],
  }, "¿Por qué apareció una transferencia?");
  expect(context.accounts[0]).toMatchObject({ company: "Lucid", period_id: "period" });
  expect(context.brokerTransfers[0]).toMatchObject({
    amount_cents: 234888,
    detected_direction: "broker_to_wallet",
    event_id: "event",
    expected_balance_cents: 1000000,
    observed_balance_cents: 765112,
  });
});
