"use client";

import { isConfirmedMimicalVersion, MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

type Props = Readonly<{
  configurationEnabled: boolean;
  reportedVersion?: string | null;
}>;

export function MimicalUpdateNotice({ configurationEnabled, reportedVersion = null }: Props) {
  if (isConfirmedMimicalVersion(reportedVersion)) return null;

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
