import Image from "next/image";

import { ThemeToggle } from "./theme-toggle";
import { WorkspaceIcon } from "./workspace-icon";

type Props = Readonly<{
  email: string;
}>;

export function AccessPendingGate({ email }: Props) {
  return (
    <main className="connector-gate-shell access-pending-gate">
      <div className="connector-gate-preview" aria-hidden="true">
        <aside>
          <Image alt="" height={27} priority src="/nodal-trading-lime.png" width={150} />
          <div className="connector-preview-navigation">
            {Array.from({ length: 6 }, (_, index) => <span className={index === 0 ? "selected" : ""} key={index} />)}
          </div>
        </aside>
        <div className="connector-preview-stage">
          <div className="connector-preview-topbar"><span /><span /></div>
          <div className="connector-preview-hero"><span /><strong /><i /></div>
          <div className="connector-preview-grid"><span /><span /><span /></div>
        </div>
      </div>
      <div className="connector-gate-scrim" aria-hidden="true" />

      <div className="connector-gate-actions">
        <ThemeToggle />
        <form action="/auth/logout" method="post">
          <button type="submit"><WorkspaceIcon name="logout" />Salir</button>
        </form>
      </div>

      <section className="connector-gate-modal" aria-labelledby="access-pending-title" role="status">
        <div className="connector-gate-brand">
          <Image alt="NODAL Trading" height={27} priority src="/nodal-trading-lime.png" width={152} />
        </div>
        <h1 id="access-pending-title">Acceso pendiente</h1>
        <p className="summary">
          La cuenta <strong>{email}</strong> ya fue verificada. NODAL debe habilitarla antes de mostrar información operativa.
        </p>
        <div className="access-pending-status">
          <span aria-hidden="true" />
          Esperando autorización
        </div>
        <footer>
          <span>Todavía no se compartieron datos de NODAL</span>
        </footer>
      </section>
    </main>
  );
}
