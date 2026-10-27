import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { OpeningSetupPreview } from "./opening-setup-preview";

describe("simplified opening screen", () => {
  it("captures only available money before the preview", () => {
    const html = renderToStaticMarkup(createElement(OpeningSetupPreview, {
      autoOpen: true,
      liveBrokerBalance: {
        balanceInCents: 1_000_000,
        observedAt: "2026-10-27T13:00:00.000Z",
        sourceAccounts: [{
          accountName: "BROKER-1",
          balanceInCents: 1_000_000,
          connectionName: "Broker",
        }],
      },
      periodId: "00000000-0000-4000-8000-000000000001",
      simplified: true,
    }));

    expect(html).toContain("Dinero disponible");
    expect(html).toContain("Vista previa");
    expect(html).toContain("Continuar");
    expect(html).not.toContain("Cuentas iniciales");
    expect(html).not.toContain("Flotante actual comprometido");
  });
});
