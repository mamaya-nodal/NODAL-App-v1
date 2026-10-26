"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useRef, useSyncExternalStore } from "react";

import {
  canOpenDeskAdmin,
  canOpenMasterAdmin,
  type AdministrationScope,
} from "@/modules/admin/domain/administration-scope";

import { ThemeToggle } from "./theme-toggle";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace-icon";
import {
  WorkspaceUserMenu,
  type WorkspaceVersionInfo,
} from "./workspace-user-menu";

export type WorkspaceView = "home" | "accounts" | "operations" | "accounting" | "identities" | "configuration";

type WorkspaceViewDefinition = Readonly<{ hash: string; icon: WorkspaceIconName; label: string; value: WorkspaceView }>;

const views: ReadonlyArray<WorkspaceViewDefinition> = [
  { hash: "inicio", icon: "home", label: "Inicio", value: "home" },
  { hash: "cuentas", icon: "plus", label: "Cuentas", value: "accounts" },
  { hash: "operaciones", icon: "daily", label: "Operaciones", value: "operations" },
  { hash: "contabilidad", icon: "summary", label: "Contabilidad", value: "accounting" },
  { hash: "identidades", icon: "identities", label: "Identidades", value: "identities" },
  { hash: "configuracion", icon: "settings", label: "Configuración", value: "configuration" },
];

const legacyViews: Readonly<Record<string, WorkspaceView>> = {
  actividad: "accounting",
  compras: "accounts",
  "control-diario": "operations",
  registro: "operations",
  resumen: "accounting",
};

type Props = Readonly<{
  administrationScope: AdministrationScope;
  authorized: boolean;
  avatarUrl?: string | null;
  children: ReactNode;
  configurationEnabled: boolean;
  identitiesEnabled: boolean;
  initialView?: WorkspaceView;
  userLabel: string;
  username?: string;
  versionInfo: WorkspaceVersionInfo;
}>;

export function availableWorkspaceViews(input: Readonly<{
  configurationEnabled: boolean;
  identitiesEnabled: boolean;
}>): ReadonlyArray<WorkspaceViewDefinition> {
  return views.filter((view) => (
    (view.value !== "identities" || input.identitiesEnabled)
    && (view.value !== "configuration" || input.configurationEnabled)
  ));
}

function viewFromHash(fallback: WorkspaceView, availableViews: ReadonlyArray<WorkspaceViewDefinition>): WorkspaceView {
  const hash = window.location.hash.replace("#", "");
  const directView = availableViews.find((view) => view.hash === hash)?.value;
  if (directView) return directView;
  const legacyView = legacyViews[hash];
  return legacyView && availableViews.some((view) => view.value === legacyView) ? legacyView : fallback;
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function AppWorkspace({
  administrationScope,
  authorized,
  avatarUrl,
  children,
  configurationEnabled,
  identitiesEnabled,
  initialView = "home",
  userLabel,
  username,
  versionInfo,
}: Props) {
  const visibleViews = availableWorkspaceViews({ configurationEnabled, identitiesEnabled });
  const permittedInitialView = visibleViews.some((view) => view.value === initialView) ? initialView : "home";
  // Una actualizaciÃ³n de datos no debe reinterpretar avisos viejos de la URL
  // ni sacar al usuario de la pantalla que estaba usando.
  const initialViewRef = useRef(permittedInitialView);
  const activeView = useSyncExternalStore(
    subscribe,
    () => viewFromHash(initialViewRef.current, visibleViews),
    () => initialViewRef.current,
  );

  if (!authorized) {
    return <main className="shell narrow-shell app-page-shell">{children}</main>;
  }

  function navigateWithinWorkspace(event: MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href")?.slice(1);
    const legacyView = legacyViews[hash ?? ""];
    if (!visibleViews.some((view) => view.hash === hash)
      && (!legacyView || !visibleViews.some((view) => view.value === legacyView))) return;

    event.preventDefault();
    window.history.replaceState(null, "", `#${hash}`);
    window.dispatchEvent(new Event("hashchange"));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  const administration = [
    ...(canOpenDeskAdmin(administrationScope)
      ? [{ href: "/app/mi-mesa", label: "Admin" }]
      : []),
    ...(canOpenMasterAdmin(administrationScope)
      ? [{ href: "/app/admin", label: "Admin Master" }]
      : []),
  ];

  return (
    <main className="nodal-workspace" data-active-view={activeView} onClick={navigateWithinWorkspace}>
      <aside className="workspace-sidebar">
        <a className="workspace-logo" href="#inicio" aria-label="Ir al inicio">
          <Image alt="NODAL Trading" height={32} priority src="/nodal-trading-lime.png" width={178} />
        </a>

        <nav className="workspace-navigation" aria-label="Navegación principal">
          {visibleViews.map((view) => (
            <a
              aria-current={activeView === view.value ? "page" : undefined}
              href={`#${view.hash}`}
              key={view.value}
            >
              <WorkspaceIcon name={view.icon} />
              {view.label}
            </a>
          ))}
          {administration.map((item) => (
            <Link href={item.href} key={item.href}>
              <WorkspaceIcon name="admin" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="workspace-sidebar-footer">
          <form action="/auth/logout" method="post">
            <button type="submit"><WorkspaceIcon name="logout" />Cerrar sesión</button>
          </form>
        </div>
      </aside>

      <div className="workspace-stage">
        <header className="workspace-topbar">
          <div className="workspace-top-actions">
            <ThemeToggle />
            <WorkspaceUserMenu
              avatarUrl={avatarUrl}
              configurationEnabled={configurationEnabled}
              userLabel={userLabel}
              username={username}
              versionInfo={versionInfo}
            />
          </div>
        </header>

        <div className="app-page-shell workspace-content">{children}</div>

        <nav className="workspace-mobile-navigation" aria-label="Navegación móvil">
          {visibleViews.map((view) => (
            <a
              aria-current={activeView === view.value ? "page" : undefined}
              href={`#${view.hash}`}
              key={view.value}
            >
              <WorkspaceIcon name={view.icon} />
              {view.label}
            </a>
          ))}
          {administration.map((item) => (
            <Link href={item.href} key={item.href}><WorkspaceIcon name="admin" />{item.label}</Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
