"use client";

import { useEffect, useRef, useState } from "react";

import {
  LATEST_NINJA_CONNECTOR_VERSION,
  connectorVersionState,
} from "@/modules/ninja/domain/connector-version";

export type WorkspaceVersionInfo = Readonly<{
  appRevision: string | null;
  appVersion: string;
  connectorOnline: boolean | null;
  connectorInstalledSourceVersion: string | null;
  connectorVersion: string | null;
}>;

type MenuSection = "configuration" | "help" | "version";

type Props = Readonly<{
  avatarUrl?: string | null;
  userLabel: string;
  username?: string;
  versionInfo: WorkspaceVersionInfo;
}>;

function initials(label: string) {
  return label
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function WorkspaceUserMenu({
  avatarUrl,
  userLabel,
  username,
  versionInfo,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<MenuSection | null>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSection(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSection(null);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectSection(nextSection: MenuSection) {
    setSection((current) => current === nextSection ? null : nextSection);
  }

  const versionState = connectorVersionState({
    installedSourceVersion: versionInfo.connectorInstalledSourceVersion,
    runningVersion: versionInfo.connectorVersion,
  });
  const versionMessage = versionState === "current"
    ? "Conector actualizado y activo."
    : versionState === "pending_activation"
      ? "El código nuevo ya fue copiado. Falta compilar o reiniciar NinjaTrader."
      : versionState === "update_available"
        ? `Actualización disponible: v${LATEST_NINJA_CONNECTOR_VERSION}.`
        : "La app todavía no recibió información de esta instalación.";

  return (
    <div className="workspace-user-menu" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="workspace-user workspace-user-trigger"
        onClick={() => {
          setOpen((current) => !current);
          if (open) setSection(null);
        }}
        title={userLabel}
        type="button"
      >
        <span className="workspace-user-name">{username || userLabel}</span>
        <span className="workspace-avatar">
          {avatarUrl ? <img alt="" src={avatarUrl} /> : initials(userLabel)}
        </span>
        <span aria-hidden="true" className="workspace-user-chevron">⌄</span>
      </button>

      {open ? (
        <div className="workspace-user-popover">
          <div aria-label="Menú del usuario" className="workspace-user-options" role="menu">
            <button
              aria-current={section === "configuration" ? "true" : undefined}
              onClick={() => selectSection("configuration")}
              role="menuitem"
              type="button"
            >
              Configuración
            </button>
            <button
              aria-current={section === "help" ? "true" : undefined}
              onClick={() => selectSection("help")}
              role="menuitem"
              type="button"
            >
              Ayuda
            </button>
            <button
              aria-current={section === "version" ? "true" : undefined}
              onClick={() => selectSection("version")}
              role="menuitem"
              type="button"
            >
              Versión
            </button>
          </div>

          {section === "configuration" ? (
            <div className="workspace-user-section">
              <strong>Configuración</strong>
              <p>Las preferencias personales se incorporarán en este espacio.</p>
            </div>
          ) : null}

          {section === "help" ? (
            <div className="workspace-user-section">
              <strong>Ayuda</strong>
              <div className="workspace-help-options">
                <button disabled type="button">
                  <span>Preguntas frecuentes</span>
                  <small>Próximamente</small>
                </button>
                <a href="/app/help/contact" rel="noopener noreferrer" target="_blank">
                  <span>Contacto</span>
                  <small>Abrir ticket ↗</small>
                </a>
              </div>
            </div>
          ) : null}

          {section === "version" ? (
            <div className="workspace-user-section workspace-version-section">
              <strong>Versiones instaladas</strong>
              <dl>
                <div>
                  <dt>Aplicación</dt>
                  <dd>v{versionInfo.appVersion}</dd>
                </div>
                <div>
                  <dt>Revisión</dt>
                  <dd>{versionInfo.appRevision ?? "Entorno local"}</dd>
                </div>
                <div>
                  <dt>En ejecución</dt>
                  <dd>{versionInfo.connectorVersion ? `v${versionInfo.connectorVersion}` : "Sin información"}</dd>
                </div>
                <div>
                  <dt>Código actualizado</dt>
                  <dd>{versionInfo.connectorInstalledSourceVersion ? `v${versionInfo.connectorInstalledSourceVersion}` : "Sin informar"}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    {versionInfo.connectorOnline === true
                      ? "En línea"
                      : versionInfo.connectorOnline === false
                        ? "Sin señal"
                        : "No disponible"}
                  </dd>
                </div>
              </dl>
              <p className={`workspace-version-status is-${versionState}`}>{versionMessage}</p>
              <small>Última versión publicada: v{LATEST_NINJA_CONNECTOR_VERSION}</small>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
