import Image from "next/image";
import Link from "next/link";

import type { AdministrationScope } from "@/modules/admin/domain/administration-scope";

import { NinjaConnectorPanel, type NinjaConnectorStatus } from "./ninja-connector-panel";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceIcon } from "./workspace-icon";

type Props = Readonly<{
  administrationScope: AdministrationScope;
  connector: NinjaConnectorStatus | null;
  message?: string;
}>;

export function NinjaConnectorGate({ administrationScope, connector, message }: Props) {
  const administration = administrationScope.kind === "master"
    ? { href: "/app/admin", label: "Admin Master" }
    : administrationScope.kind === "desk"
      ? { href: "/app/mi-mesa", label: "Mi mesa" }
      : null;
  return (
    <main className="connector-gate-shell">
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

      <section className="connector-gate-modal" aria-labelledby="connector-gate-title" role="dialog" aria-modal="true">
        <div className="connector-gate-brand">
          <Image alt="NODAL Trading" height={27} priority src="/nodal-trading-lime.png" width={152} />
        </div>
        <h1 id="connector-gate-title">{connector ? "Abrí NinjaTrader" : "Conectá NinjaTrader"}</h1>
        <p className="summary">
          {connector
            ? "Tu vínculo ya está listo. El acceso se habilitará cuando NODAL reciba la señal del complemento."
            : "Vinculá el complemento una sola vez para habilitar tu espacio de trabajo."}
        </p>

        {message ? <p className="purchase-message success" role="status">{message}</p> : null}
        <div className="connector-install-step">
          <a download href="/api/downloads/ninja-connector">Descargar conector</a>
          <span>Después generá el código y ejecutá el instalador en la PC de NinjaTrader.</span>
        </div>
        <NinjaConnectorPanel compact connector={connector} monitor />

        <footer>
          <span>Conexión segura y de solo lectura</span>
          {administration ? <Link href={administration.href}>{administration.label}</Link> : null}
        </footer>
      </section>
    </main>
  );
}
