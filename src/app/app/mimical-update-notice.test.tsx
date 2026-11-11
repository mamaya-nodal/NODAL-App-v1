import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MimicalUpdateNotice } from "./mimical-update-notice";

describe("MIMICAL update notice", () => {
  it("sends users with Configuración enabled to the update screen", () => {
    const html = renderToStaticMarkup(createElement(MimicalUpdateNotice, {
      configurationEnabled: true,
      reportedVersion: "1.1.0.7",
    }));

    expect(html).toContain("Nueva versión de MIMICAL disponible (v1.1.0.8)");
    expect(html).toContain('href="#configuracion"');
    expect(html).toContain("Descargar");
    expect(html).not.toContain("ACTUALIZACIÓN DISPONIBLE");
  });

  it("does not bypass Admin Master permissions when Configuración is disabled", () => {
    const html = renderToStaticMarkup(createElement(MimicalUpdateNotice, { configurationEnabled: false }));

    expect(html).toContain("Nueva versión de MIMICAL disponible (v1.1.0.8)");
    expect(html).toContain("se habilita desde Admin Master");
    expect(html).not.toContain('href="#configuracion"');
  });

  it("disappears after NinjaTrader confirms version 1.1.0.8", () => {
    const html = renderToStaticMarkup(createElement(MimicalUpdateNotice, {
      configurationEnabled: true,
      reportedVersion: "1.1.0.8",
    }));

    expect(html).toBe("");
  });
});
