"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useRef, useSyncExternalStore } from "react";

import { ThemeToggle } from "./theme-toggle";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace-icon";

type View = "home" | "purchases" | "daily" | "register" | "summary" | "activity";

const views: ReadonlyArray<Readonly<{ hash: string; icon: WorkspaceIconName; label: string; value: View }>> = [
  { hash: "inicio", icon: "home", label: "Inicio", value: "home" },
  { hash: "compras", icon: "plus", label: "Compras", value: "purchases" },
  { hash: "control-diario", icon: "daily", label: "Control diario", value: "daily" },
  { hash: "registro", icon: "register", label: "Registro", value: "register" },
  { hash: "resumen", icon: "summary", label: "Resumen operativo", value: "summary" },
  { hash: "actividad", icon: "activity", label: "Actividad", value: "activity" },
];

type Props = Readonly<{
  authorized: boolean;
  children: ReactNode;
  initialView?: View;
  isAdmin: boolean;
  modalityLabel?: string;
  periodLabel?: string;
  userLabel: string;
}>;

function viewFromHash(fallback: View): View {
  const hash = window.location.hash.replace("#", "");
  return views.find((view) => view.hash === hash)?.value ?? fallback;
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function initials(label: string) {
  return label
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppWorkspace({
  authorized,
  children,
  initialView = "home",
  isAdmin,
  modalityLabel,
  periodLabel,
  userLabel,
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

  const activeLabel = views.find((view) => view.value === activeView)?.label ?? "Inicio";

  function navigateWithinWorkspace(event: MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href")?.slice(1);
    if (!views.some((view) => view.hash === hash)) return;

    event.preventDefault();
    window.history.replaceState(null, "", `#${hash}`);
    window.dispatchEvent(new Event("hashchange"));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

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
          {isAdmin && (
            <Link href="/app/admin">
              <WorkspaceIcon name="admin" />
              Administración
            </Link>
          )}
        </nav>

        <div className="workspace-sidebar-footer">
          <p>ESTRATEGIA · COBERTURA</p>
          <p>FONDEO INTELIGENTE</p>
          <form action="/auth/logout" method="post">
            <button type="submit"><WorkspaceIcon name="logout" />Cerrar sesión</button>
          </form>
        </div>
      </aside>

      <div className="workspace-stage">
        <header className="workspace-topbar">
          <div>
            <span>Espacio personal · {modalityLabel ?? "Sin modalidad"}</span>
            <strong>{activeLabel}</strong>
          </div>
          <div className="workspace-top-actions">
            <span className="workspace-period"><WorkspaceIcon name="calendar" />{periodLabel ?? "Sin período"}</span>
            <ThemeToggle />
            <span className="workspace-avatar" title={userLabel}>{initials(userLabel)}</span>
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
              {view.label === "Resumen operativo" ? "Resumen" : view.label}
            </a>
          ))}
          {isAdmin && (
            <Link href="/app/admin"><WorkspaceIcon name="admin" />Admin</Link>
          )}
        </nav>
      </div>
    </main>
  );
}
