import { describe, expect, it, vi } from "vitest";

import {
  hasDownloadedCurrentMimical,
  hasSentCurrentIdentityMimical,
  identityMimicalUpdateStorageKey,
  markCurrentMimicalDownloaded,
  markCurrentIdentityMimicalSent,
  MIMICAL_IDENTITY_UPDATE_SENT_EVENT,
  MIMICAL_UPDATE_DOWNLOADED_EVENT,
  MIMICAL_UPDATE_STORAGE_KEY,
} from "./mimical-update-status";

describe("MIMICAL update download status", () => {
  it("marks only the current version and notifies the open workspace", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const dispatchEvent = vi.fn(() => true);

    expect(hasDownloadedCurrentMimical(storage)).toBe(false);
    markCurrentMimicalDownloaded(storage, { dispatchEvent });

    expect(values.get(MIMICAL_UPDATE_STORAGE_KEY)).toBe("true");
    expect(hasDownloadedCurrentMimical(storage)).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: MIMICAL_UPDATE_DOWNLOADED_EVENT }));
  });

  it("tracks the emailed update independently for each identity", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const dispatchEvent = vi.fn(() => true);

    markCurrentIdentityMimicalSent("identity-a", storage, { dispatchEvent });

    expect(values.get(identityMimicalUpdateStorageKey("identity-a"))).toBe("true");
    expect(hasSentCurrentIdentityMimical("identity-a", storage)).toBe(true);
    expect(hasSentCurrentIdentityMimical("identity-b", storage)).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: MIMICAL_IDENTITY_UPDATE_SENT_EVENT }));
  });
});
