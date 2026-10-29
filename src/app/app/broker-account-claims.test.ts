import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./broker-account-actions", () => ({ claimBrokerAccount: vi.fn(), discardBrokerAccount: vi.fn() }));

import { BrokerAccountClaims } from "./broker-account-claims";

describe("broker account claims", () => {
  it("presents broker ownership separately from prop accounts and identities", () => {
    const markup = renderToStaticMarkup(createElement(BrokerAccountClaims, { accounts: [{
      accountName: "2149906",
      balanceInCents: 819_671,
      connectionName: "Live",
      physicalConnectorId: "69b6c516-c0d8-4691-862b-2b15af76bd10",
    }] }));
    expect(markup).toContain("CUENTA BROKER DEL USUARIO");
    expect(markup).toContain("Confirmar cuenta broker");
    expect(markup).toContain("Descartar");
    expect(markup).toContain("2149906");
    expect(markup).not.toContain("Es mía");
  });
});
