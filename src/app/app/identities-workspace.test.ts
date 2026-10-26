import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IdentitySummary } from "@/modules/identities/domain/identity-summary";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./identity-actions", () => ({ assignIdentityAccount: vi.fn(), createIdentityDirectly: vi.fn(),
  retireIdentity: vi.fn(), sendIdentityConnectorInstallation: vi.fn(), unassignIdentityAccount: vi.fn(), setIdentitySignal: vi.fn(), updateIdentityOperationalStatus: vi.fn() }));
vi.mock("./ninja-connector-panel", () => ({ NinjaConnectorPanel: ({ downloadLabel }: { downloadLabel: string }) =>
  createElement("button", {}, downloadLabel) }));
import { IdentitiesWorkspace } from "./identities-workspace";

const identity: IdentitySummary = { id: "identity", firstName: "Test", lastName: "Identity", contactEmail: "test@example.com",
  onboardingStatus: "approved", credentialsStatus: "pending", documentationStatus: "pending", driveFolderUrl: null,
  operationalStatus: "active", accounts: [], burnedCompanyCount: 1, companyPowers: [
    { burned: true, code: "LUCID", id: "lucid", name: "Lucid", payoutCount: 4, progress: 1 },
  ], connectorInstallation: null, deteriorationLevel: 1, resultTotalInCents: 0, payoutTotalInCents: 0,
  wallets: [{ balanceInCents: 125_000, id: "wallet", identityId: "identity", name: "ARQ · Test" }] };
function render(value = identity, configurationEnabled = true) {
  return renderToStaticMarkup(createElement(IdentitiesWorkspace, { accounts: [], configurationEnabled, connectors: [], identities: [value], ownerName: "Titular", signalStates: {}, workspaceId: "workspace" }));
}
describe("identity installation is independent of email delivery", () => {
  it("offers the automatic installer after unlinking without requiring another email", () => {
    expect(render()).toContain("Descargar instalador");
    expect(render()).toContain("Enviar instalación");
  });
  it.each(["sending", "sent", "downloaded", "failed"] as const)("keeps direct installation for status %s", (status) => {
    expect(render({ ...identity, connectorInstallation: { identityId: identity.id, status,
      createdAt: "2026-09-24T00:00:00Z", expiresAt: "2026-09-25T00:00:00Z", sentAt: null } })).toContain("Descargar instalador");
  });
  it("does not offer an installer for an unapproved identity", () => {
    expect(render({ ...identity, onboardingStatus: "inactive" })).not.toContain("Descargar instalador");
  });
  it("shows identity configuration only when the capability and identity are enabled", () => {
    expect(render()).toContain("Configuración");
    expect(render(identity, false)).not.toContain("Complementos");
    expect(render({ ...identity, onboardingStatus: "inactive" })).not.toContain("Complementos");
  });
  it("shows wallets assigned to the identity without changing its economic totals", () => {
    expect(render()).toContain("Billeteras o cuentas bancarias");
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
});
