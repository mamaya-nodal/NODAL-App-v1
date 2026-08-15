"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

import { ThemeToggle } from "./theme-toggle";

type View = "home" | "purchases" | "daily" | "register" | "summary" | "activity";

const views: ReadonlyArray<Readonly<{ hash: string; icon: string; label: string; value: View }>> = [
  { hash: "inicio", icon: "⌂", label: "Inicio", value: "home" },
  { hash: "compras", icon: "+", label: "Compras", value: "purchases" },
  { hash: "control-diario", icon: "↗", label: "Control diario", value: "daily" },
  { hash: "registro", icon: "▤", label: "Registro", value: "register" },
  { hash: "resumen", icon: "◔", label: "Resumen operativo", value: "summary" },
  { hash: "actividad", icon: "◷", label: "Actividad", value: "activity" },
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
  const activeView = useSyncExternalStore(
    subscribe,
    () => viewFromHash(initialView),
    () => initialView,
  );

  if (!authorized) {
    return <main className="shell narrow-shell app-page-shell">{children}</main>;
  }

  const activeLabel = views.find((view) => view.value === activeView)?.label ?? "Inicio";

  return (
    <main className="nodal-workspace" data-active-view={activeView}>
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
              <span aria-hidden="true">{view.icon}</span>
              {view.label}
            </a>
          ))}
          {isAdmin && (
            <Link href="/app/admin">
              <span aria-hidden="true">◇</span>
              Administración
            </Link>
          )}
        </nav>

        <div className="workspace-sidebar-footer">
          <p>ESTRATEGIA · COBERTURA</p>
          <p>FONDEO INTELIGENTE</p>
          <form action="/auth/logout" method="post">
            <button type="submit">Cerrar sesión</button>
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
            <span className="workspace-period">{periodLabel ?? "Sin período"}</span>
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
              <span aria-hidden="true">{view.icon}</span>
              {view.label === "Resumen operativo" ? "Resumen" : view.label}
            </a>
          ))}
          {isAdmin && (
            <Link href="/app/admin"><span aria-hidden="true">◇</span>Admin</Link>
          )}
        </nav>
      </div>
    </main>
  );
}
