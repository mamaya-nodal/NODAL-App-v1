import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./identity-actions", () => ({
  sendIdentityMimicalInstallation: vi.fn(),
}));

import { IdentityMimicalConfiguration, MimicalConfiguration } from "./mimical-configuration";

describe("MIMICAL configuration", () => {
  it("keeps the local download for the NODAL user's own Ninja", () => {
    const html = renderToStaticMarkup(createElement(MimicalConfiguration, { enabled: true }));
    expect(html).toContain("Descargar MIMICAL");
    expect(html).not.toContain("Enviar MIMICAL por correo");
  });

  it("sends the identity installer by email while keeping its pairing code", () => {
    const html = renderToStaticMarkup(createElement(IdentityMimicalConfiguration, {
      identityEmail: "identidad@example.com",
      identityId: "22222222-2222-4222-8222-222222222222",
      identityName: "Identidad Prueba",
      onClose: vi.fn(),
    }));
    expect(html).toContain("Enviar MIMICAL por correo");
    expect(html).toContain("identidad@example.com");
    expect(html).toContain("Generar código de vinculación");
    expect(html).not.toContain("Descargar MIMICAL");
  });
});
