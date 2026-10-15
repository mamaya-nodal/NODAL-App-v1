import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IdentitySummary } from "@/modules/identities/domain/identity-summary";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./identity-actions", () => ({ assignIdentityAccount: vi.fn(), claimIdentityBrokerAccount: vi.fn(), createIdentityDirectly: vi.fn(),
  sendIdentityConnectorInstallation: vi.fn(), unassignIdentityAccount: vi.fn(), setIdentitySignal: vi.fn(), updateIdentityOperationalStatus: vi.fn() }));
vi.mock("./ninja-connector-panel", () => ({ NinjaConnectorPanel: ({ pairingLabel }: { pairingLabel: string }) =>
  createElement("button", {}, pairingLabel) }));
import { IdentitiesWorkspace } from "./identities-workspace";

const identity: IdentitySummary = { id: "identity", firstName: "Test", lastName: "Identity", contactEmail: "test@example.com",
  onboardingStatus: "approved", credentialsStatus: "pending", documentationStatus: "pending", driveFolderUrl: null,
  operationalStatus: "active", accounts: [], burnedCompanyCount: 1, companyPowers: [
    { burned: true, code: "LUCID", id: "lucid", name: "Lucid", payoutCount: 4, progress: 1 },
  ], connectorInstallation: null, deteriorationLevel: 1, resultTotalInCents: 0, payoutTotalInCents: 0,
  wallets: [{ balanceInCents: 125_000, id: "wallet", identityId: "identity", name: "ARQ · Test" }] };
function render(value = identity, brokerAccounts: ComponentProps<typeof IdentitiesWorkspace>["brokerAccounts"] = []) {
  return renderToStaticMarkup(createElement(IdentitiesWorkspace, { accounts: [], brokerAccounts, connectors: [], identities: [value], ownerName: "Titular", signalStates: {}, workspaceId: "workspace" }));
}
describe("identity pairing is independent of email delivery", () => {
  it("offers a code after unlinking without requiring another email", () => {
    expect(render()).toContain("Generar código");
    expect(render()).toContain("Enviar instalación");
  });
  it.each(["sending", "sent", "downloaded", "failed"] as const)("keeps code generation for installation status %s", (status) => {
    expect(render({ ...identity, connectorInstallation: { identityId: identity.id, status,
      createdAt: "2026-09-24T00:00:00Z", expiresAt: "2026-09-25T00:00:00Z", sentAt: null } })).toContain("Generar código");
  });
  it("does not offer a code for an unapproved identity", () => {
    expect(render({ ...identity, onboardingStatus: "inactive" })).not.toContain("Generar código");
  });
  it("shows wallets assigned to the identity without changing its economic totals", () => {
    expect(render()).toContain("Billeteras");
    expect(render()).toContain("ARQ · Test");
    expect(render()).toContain("US$\u00a01.250");
  });
  it("shows manual states, automatic deterioration and the identity board", () => {
    const markup = render();
    expect(markup).toContain("Mapa de identidades");
    expect(markup).toContain("Deterioro 1");
    expect(markup).toContain("LUCID");
    expect(markup).toContain("Quemada");
    expect(markup).toContain("Desconfigurada");
    expect(markup).toContain("Muerta");
  });
  it("keeps a detected broker account inside its identity and labels the assignment", () => {
    const markup = render(identity, [{
      accountName: "2149906",
      balanceInCents: 819_671,
      connectionName: "Live",
      identityId: identity.id,
      physicalConnectorId: "69b6c516-c0d8-4691-862b-2b15af76bd10",
      status: "pending",
    }]);
    expect(markup).toContain("Cuenta broker");
    expect(markup).toContain("2149906");
    expect(markup).toContain("Asignar a Test");
    expect(markup).not.toContain("Es mía");
  });
  it("shows confirmed broker ownership independently from prop accounts", () => {
    const markup = render(identity, [{
      accountName: "2149906",
      balanceInCents: null,
      connectionName: "Live",
      identityId: identity.id,
      physicalConnectorId: "69b6c516-c0d8-4691-862b-2b15af76bd10",
      status: "confirmed",
    }]);
    expect(markup).toContain("Asignada");
    expect(markup).toContain("Pendiente de nueva lectura");
  });
});
