"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "../theme-toggle";
import { WorkspaceIcon, type WorkspaceIconName } from "../workspace-icon";
import {
  WorkspaceUserMenu,
  type WorkspaceVersionInfo,
} from "../workspace-user-menu";

type Props = Readonly<{
  children: ReactNode;
  scope?: "desk" | "master";
  userLabel: string;
  versionInfo: WorkspaceVersionInfo;
}>;

export function AdminWorkspace({ children, scope = "master", userLabel, versionInfo }: Props) {
  const pathname = usePathname();
  const panelHref = scope === "desk" ? "/app/mi-mesa" : "/app/admin";
  const panelLabel = scope === "desk" ? "Mi mesa" : "Vista general";
  const scopedNavigation = [
    { href: panelHref, icon: "summary" as WorkspaceIconName, label: panelLabel },
    ...(scope === "master" ? [{ href: "/app/admin/periods", icon: "daily" as WorkspaceIconName, label: "Cierres" }] : []),
  ];
  const isActive = (href: string) => pathname === href;
  const activeLabel = pathname.startsWith("/app/admin/users")
    ? "Usuarios"
    : pathname.startsWith("/app/admin/ninja")
      ? "Conectores Ninja"
      : pathname.startsWith("/app/admin/periods")
        ? "Cierres contables"
      : pathname === panelHref
        ? panelLabel
        : "Ficha del usuario";

  return (
    <main className="nodal-workspace admin-workspace">
      <aside className="workspace-sidebar">
        <Link className="workspace-logo" href={panelHref} aria-label="Ir al panel de administración">
          <Image alt="NODAL Trading" height={32} priority src="/nodal-trading-lime.png" width={178} />
        </Link>

        <nav className="workspace-navigation" aria-label="Navegación de administración">
          {scopedNavigation.map((item) => {
            return <Link aria-current={isActive(item.href) ? "page" : undefined} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} />{item.label}</Link>;
          })}
          <Link href="/app#inicio"><WorkspaceIcon name="home" />Volver a mi espacio</Link>
        </nav>

        <div className="workspace-sidebar-footer">
          <p>{scope === "desk" ? "ADMINISTRACIÓN DE MESA" : "ADMINISTRACIÓN NODAL"}</p>
          <form action="/auth/logout" method="post"><button type="submit"><WorkspaceIcon name="logout" />Cerrar sesión</button></form>
        </div>
      </aside>

      <div className="workspace-stage">
        <header className="workspace-topbar">
          <div><span>{scope === "desk" ? "Administración de mesa" : "Panel de administración"}</span><strong>{activeLabel}</strong></div>
          <div className="workspace-top-actions">
            <ThemeToggle />
            <WorkspaceUserMenu userLabel={userLabel} versionInfo={versionInfo} />
          </div>
        </header>
        <div className="app-page-shell workspace-content admin-page-shell">{children}</div>
        <nav className="workspace-mobile-navigation" aria-label="Navegación móvil de administración">
          {scopedNavigation.map((item) => <Link aria-current={isActive(item.href) ? "page" : undefined} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} />{scope === "desk" ? "Mi mesa" : "Panel"}</Link>)}
          <Link href="/app#inicio"><WorkspaceIcon name="home" />Mi espacio</Link>
        </nav>
      </div>
    </main>
  );
}
