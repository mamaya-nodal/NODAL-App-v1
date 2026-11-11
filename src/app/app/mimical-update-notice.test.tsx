import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MimicalUpdateNotice } from "./mimical-update-notice";

describe("MIMICAL update notice", () => {
  it("sends users with Configuración enabled to the update screen", () => {
    const html = renderToStaticMarkup(createElement(MimicalUpdateNotice, { configurationEnabled: true }));

    expect(html).toContain("MIMICAL disponible (v1.1.0.9)");
    expect(html).toContain('href="#configuracion"');
    expect(html).toContain("Ir a Configuración");
  });

  it("does not bypass Admin Master permissions when Configuración is disabled", () => {
    const html = renderToStaticMarkup(createElement(MimicalUpdateNotice, { configurationEnabled: false }));

    expect(html).toContain("MIMICAL disponible (v1.1.0.9)");
    expect(html).toContain("se habilita desde Admin Master");
    expect(html).not.toContain('href="#configuracion"');
  });

  it("hides only when NinjaTrader reported the required version", () => {
    const html = renderToStaticMarkup(createElement(MimicalUpdateNotice, {
      configurationEnabled: true,
      reportedVersion: "1.1.0.9",
    }));
    expect(html).toBe("");
  });
});
