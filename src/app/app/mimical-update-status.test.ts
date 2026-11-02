import { describe, expect, it, vi } from "vitest";

import {
  hasDownloadedCurrentMimical,
  markCurrentMimicalDownloaded,
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
});
