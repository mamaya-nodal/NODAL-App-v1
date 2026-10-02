"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useRef, useSyncExternalStore } from "react";

import type { AdministrationScope } from "@/modules/admin/domain/administration-scope";

import { ThemeToggle } from "./theme-toggle";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace-icon";
import {
  WorkspaceUserMenu,
  type WorkspaceVersionInfo,
} from "./workspace-user-menu";

type View = "home" | "accounts" | "operations" | "accounting" | "identities";

const views: ReadonlyArray<Readonly<{ hash: string; icon: WorkspaceIconName; label: string; value: View }>> = [
  { hash: "inicio", icon: "home", label: "Inicio", value: "home" },
  { hash: "cuentas", icon: "plus", label: "Cuentas", value: "accounts" },
  { hash: "operaciones", icon: "daily", label: "Operaciones", value: "operations" },
  { hash: "contabilidad", icon: "summary", label: "Contabilidad", value: "accounting" },
  { hash: "identidades", icon: "identities", label: "Identidades", value: "identities" },
];

const legacyViews: Readonly<Record<string, View>> = {
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
  initialView?: View;
  userLabel: string;
  username?: string;
  versionInfo: WorkspaceVersionInfo;
}>;

function viewFromHash(fallback: View): View {
  const hash = window.location.hash.replace("#", "");
  return views.find((view) => view.hash === hash)?.value ?? legacyViews[hash] ?? fallback;
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
  initialView = "home",
  userLabel,
  username,
  versionInfo,
}: Props) {
  // Una actualizaciÃ³n de datos no debe reinterpretar avisos viejos de la URL
  // ni sacar al usuario de la pantalla que estaba usando.
  const initialViewRef = useRef(initialView);
  const activeView = useSyncExternalStore(
    subscribe,
    () => viewFromHash(initialViewRef.current),
    () => initialViewRef.current,
  );

  if (!authorized) {
    return <main className="shell narrow-shell app-page-shell">{children}</main>;
  }

  function navigateWithinWorkspace(event: MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href")?.slice(1);
    if (!views.some((view) => view.hash === hash) && !legacyViews[hash ?? ""]) return;

    event.preventDefault();
    window.history.replaceState(null, "", `#${hash}`);
    window.dispatchEvent(new Event("hashchange"));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  const administration = administrationScope.kind === "master"
    ? { href: "/app/admin", label: "Admin Master" }
    : administrationScope.kind === "desk"
      ? { href: "/app/mi-mesa", label: "Mi mesa" }
      : null;

  return (
    <main className="nodal-workspace" data-active-view={activeView} onClick={navigateWithinWorkspace}>
      <aside className="workspace-sidebar">
        <a className="workspace-logo" href="#inicio" aria-label="Ir al inicio">
          <Image alt="NODAL Trading" height={32} priority src="/nodal-trading-lime.png" width={178} />
        </a>

        <nav className="workspace-navigation" aria-label="Navegación principal">
          {views.map((view) => (
            <a
              aria-current={activeView === view.value ? "page" : undefined}
              href={`#${view.hash}`}
              key={view.value}
            >
              <WorkspaceIcon name={view.icon} />
              {view.label}
            </a>
          ))}
          {administration && (
            <Link href={administration.href}>
              <WorkspaceIcon name="admin" />
              {administration.label}
            </Link>
          )}
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
              userLabel={userLabel}
              username={username}
              versionInfo={versionInfo}
            />
          </div>
        </header>

        <div className="app-page-shell workspace-content">{children}</div>

        <nav className="workspace-mobile-navigation" aria-label="Navegación móvil">
          {views.map((view) => (
            <a
              aria-current={activeView === view.value ? "page" : undefined}
              href={`#${view.hash}`}
              key={view.value}
            >
              <WorkspaceIcon name={view.icon} />
              {view.label}
            </a>
          ))}
          {administration && (
            <Link href={administration.href}><WorkspaceIcon name="admin" />{administration.label}</Link>
          )}
        </nav>
      </div>
    </main>
  );
}
