import { MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

export const MIMICAL_UPDATE_DOWNLOADED_EVENT = "nodal:mimical-update-downloaded";
export const MIMICAL_UPDATE_STORAGE_KEY = `nodal:mimical-update-downloaded:${MIMICAL_VERSION}`;

type DownloadStorage = Pick<Storage, "getItem" | "setItem">;
type DownloadEventTarget = Pick<Window, "dispatchEvent">;

export function hasDownloadedCurrentMimical(storage: DownloadStorage = window.localStorage) {
  try {
    return storage.getItem(MIMICAL_UPDATE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markCurrentMimicalDownloaded(
  storage: DownloadStorage = window.localStorage,
  eventTarget: DownloadEventTarget = window,
) {
  try {
    storage.setItem(MIMICAL_UPDATE_STORAGE_KEY, "true");
  } catch {
    // La descarga ya ocurrió; un almacenamiento bloqueado no debe convertirla en error.
  }
  eventTarget.dispatchEvent(new Event(MIMICAL_UPDATE_DOWNLOADED_EVENT));
}

export function subscribeToMimicalDownload(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MIMICAL_UPDATE_STORAGE_KEY) callback();
  };
  window.addEventListener(MIMICAL_UPDATE_DOWNLOADED_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MIMICAL_UPDATE_DOWNLOADED_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}
