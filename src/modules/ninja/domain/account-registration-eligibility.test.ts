import { describe, expect, it } from "vitest";

import { ninjaAccountRegistrationKey } from "./account-registration-key";
import { registeredNinjaAccountKeys } from "./account-registration-eligibility";

const link = {
  accountName: "LFE05088021070002",
  connectionName: "Lucid Mauri",
  connectorId: "connector-a",
  linkedAt: "2026-09-25T13:01:48.000Z",
};

describe("registered Ninja account keys", () => {
  it("keeps a burned but still-visible account registered", () => {
    const keys = registeredNinjaAccountKeys([link], [{
      connectorId: "connector-a",
      connectionName: "Lucid Mauri",
      eventType: "burned",
      occurredAt: "2026-09-28T14:22:30.000Z",
      resolutionStatus: "automatic",
      toAccountName: null,
    }]);

    expect(keys.has(ninjaAccountRegistrationKey("connector-a", "Lucid Mauri", "LFE05088021070002"))).toBe(true);
  });

  it("allows registration after a verified reset of the same external name", () => {
    const keys = registeredNinjaAccountKeys([link], [{
      connectorId: "connector-a",
      connectionName: "Lucid Mauri",
      eventType: "reset_after_burn",
      occurredAt: "2026-09-29T12:00:00.000Z",
      resolutionStatus: "automatic",
      toAccountName: "LFE05088021070002",
    }]);

    expect(keys.has(ninjaAccountRegistrationKey("connector-a", "Lucid Mauri", "LFE05088021070002"))).toBe(false);
  });

  it("blocks the new life again after it is registered", () => {
    const keys = registeredNinjaAccountKeys([
      link,
      { ...link, linkedAt: "2026-09-29T12:05:00.000Z" },
    ], [{
      connectorId: "connector-a",
      connectionName: "Lucid Mauri",
      eventType: "reset",
      occurredAt: "2026-09-29T12:00:00.000Z",
      resolutionStatus: "automatic",
      toAccountName: "LFE05088021070002",
    }]);

    expect(keys.has(ninjaAccountRegistrationKey("connector-a", "Lucid Mauri", "LFE05088021070002"))).toBe(true);
  });
});
