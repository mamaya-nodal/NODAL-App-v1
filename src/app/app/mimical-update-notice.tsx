"use client";

import { useSyncExternalStore } from "react";

import { MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

import { hasDownloadedCurrentMimical, subscribeToMimicalDownload } from "./mimical-update-status";

type Props = Readonly<{
  configurationEnabled: boolean;
}>;

export function MimicalUpdateNotice({ configurationEnabled }: Props) {
  const downloaded = useSyncExternalStore(
    subscribeToMimicalDownload,
    hasDownloadedCurrentMimical,
    () => false,
  );

  if (downloaded) return null;

  return (
    <aside className="mimical-update-notice notice" aria-label="Actualización de MIMICAL disponible">
      <div>
        <strong>Nueva versión de MIMICAL disponible (v{MIMICAL_VERSION})</strong>
      </div>
      <div className="mimical-update-notice-actions">
        {configurationEnabled ? (
          <a href="#configuracion">Descargar</a>
        ) : (
          <small>La actualización se habilita desde Admin Master.</small>
        )}
      </div>
    </aside>
  );
}
