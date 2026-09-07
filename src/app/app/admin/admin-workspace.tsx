"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "../theme-toggle";
import { WorkspaceIcon, type WorkspaceIconName } from "../workspace-icon";

type Props = Readonly<{ children: ReactNode; userLabel: string }>;

const navigation: ReadonlyArray<Readonly<{
  href: string;
  icon: WorkspaceIconName;
  label: string;
}>> = [
  { href: "/app/admin", icon: "summary", label: "Vista general" },
];

function initials(label: string) {
  return label.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function AdminWorkspace({ children, userLabel }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;
  const activeLabel = pathname.startsWith("/app/admin/users")
    ? "Usuarios"
    : pathname.startsWith("/app/admin/ninja")
      ? "Conectores Ninja"
      : pathname === "/app/admin"
        ? "Vista general"
        : "Ficha del usuario";

  return (
    <main className="nodal-workspace admin-workspace">
      <aside className="workspace-sidebar">
        <Link className="workspace-logo" href="/app/admin" aria-label="Ir al panel de administración">
          <Image alt="NODAL Trading" height={32} priority src="/nodal-trading-lime.png" width={178} />
        </Link>

        <nav className="workspace-navigation" aria-label="Navegación de administración">
          {navigation.map((item) => {
            return <Link aria-current={isActive(item.href) ? "page" : undefined} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} />{item.label}</Link>;
          })}
          <Link href="/app#inicio"><WorkspaceIcon name="home" />Volver a mi espacio</Link>
        </nav>

        <div className="workspace-sidebar-footer">
          <p>ADMINISTRACIÓN NODAL</p>
          <form action="/auth/logout" method="post"><button type="submit"><WorkspaceIcon name="logout" />Cerrar sesión</button></form>
        </div>
      </aside>

      <div className="workspace-stage">
        <header className="workspace-topbar">
          <div><span>Panel de administración</span><strong>{activeLabel}</strong></div>
          <div className="workspace-top-actions"><ThemeToggle /><span className="workspace-avatar" title={userLabel}>{initials(userLabel)}</span></div>
        </header>
        <div className="app-page-shell workspace-content admin-page-shell">{children}</div>
        <nav className="workspace-mobile-navigation" aria-label="Navegación móvil de administración">
          {navigation.map((item) => <Link aria-current={isActive(item.href) ? "page" : undefined} href={item.href} key={item.href}><WorkspaceIcon name={item.icon} />{item.label === "Vista general" ? "Panel" : item.label === "Conectores Ninja" ? "Ninja" : item.label}</Link>)}
          <Link href="/app#inicio"><WorkspaceIcon name="home" />Mi espacio</Link>
        </nav>
      </div>
    </main>
  );
}
