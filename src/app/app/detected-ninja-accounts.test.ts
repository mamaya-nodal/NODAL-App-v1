import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./purchase-actions", () => ({ createDetectedPurchase: vi.fn() }));
vi.mock("./purchase-payment-fields", () => ({ PurchasePaymentFields: () => createElement("div") }));

import { DetectedNinjaAccounts } from "./detected-ninja-accounts";

describe("Ninja account registration inbox", () => {
  it("offers Omitir on a pending prop and Actualizar in the NinjaTrader header", () => {
    const html = renderToStaticMarkup(createElement(DetectedNinjaAccounts, {
      accounts: [{ accountName: "LFE123", accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID",
        connectionName: "Ninja", firstSeenAt: "2026-09-30T12:00:00Z", phase: "Evaluation", product: "Flex",
        suggestedPurchaseDate: "2026-09-30", type: "prop" }],
      companyIds: { lucid: "company-id" }, connectorId: "connector-id", excludedAccountKeys: new Set<string>(),
      registeredAccountKeys: new Set<string>(), mode: "real", online: true, pendingBrokerAccounts: [], period: "2026-09-01", periodId: "period-id", wallets: [],
    }));
    expect(html).toContain("Actualizar");
    expect(html).toContain("Omitir");
    expect(html).toContain("Registrar cuenta");
  });

  it("renders each detected account as its own registration card", () => {
    const account = { accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID",
      connectionName: "Ninja", firstSeenAt: "2026-10-02T12:00:00Z", phase: "Evaluation", product: "Flex",
      suggestedPurchaseDate: "2026-10-02", type: "prop" } as const;
    const html = renderToStaticMarkup(createElement(DetectedNinjaAccounts, {
      accounts: [{ ...account, accountName: "LFE0011" }, { ...account, accountName: "LFE0012" }],
      companyIds: { lucid: "company-id" }, connectorId: "connector-id", excludedAccountKeys: new Set<string>(),
      registeredAccountKeys: new Set<string>(), mode: "real", online: true, pendingBrokerAccounts: [], period: "2026-10-01", periodId: "period-id", wallets: [],
    }));
    expect(html.match(/class="ninja-detected-card"/g)).toHaveLength(2);
    expect(html).toContain("LFE0011");
    expect(html).toContain("LFE0012");
  });
});
