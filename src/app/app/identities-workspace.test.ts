import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IdentitySummary } from "@/modules/identities/domain/identity-summary";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./identity-actions", () => ({ assignIdentityAccount: vi.fn(), createIdentityDirectly: vi.fn(),
  sendIdentityConnectorInstallation: vi.fn(), unassignIdentityAccount: vi.fn() }));
vi.mock("./ninja-connector-panel", () => ({ NinjaConnectorPanel: ({ pairingLabel }: { pairingLabel: string }) =>
  createElement("button", {}, pairingLabel) }));
import { IdentitiesWorkspace } from "./identities-workspace";

const identity: IdentitySummary = { id: "identity", firstName: "Test", lastName: "Identity", contactEmail: "test@example.com",
  onboardingStatus: "approved", credentialsStatus: "pending", documentationStatus: "pending", driveFolderUrl: null,
  accounts: [], connectorInstallation: null, resultTotalInCents: 0, payoutTotalInCents: 0 };
function render(value = identity) {
  return renderToStaticMarkup(createElement(IdentitiesWorkspace, { accounts: [], connectors: [], identities: [value], workspaceId: "workspace" }));
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
});
