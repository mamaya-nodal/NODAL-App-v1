import { describe, expect, it } from "vitest";

import {
  ADMINISTRATION_DESIGN_DEMO_OWNER,
  canAccessAdministrationDesignDemo,
} from "./design-demo-access";

describe("administration design demo access", () => {
  it("only enables the approved Mauricio account", () => {
    expect(canAccessAdministrationDesignDemo(ADMINISTRATION_DESIGN_DEMO_OWNER)).toBe(true);
    expect(canAccessAdministrationDesignDemo("  MAURICIOSEBASTIANAMAYA@GMAIL.COM ")).toBe(true);
    expect(canAccessAdministrationDesignDemo("mamaya@nodaltrading.com")).toBe(false);
    expect(canAccessAdministrationDesignDemo(null)).toBe(false);
  });
});
