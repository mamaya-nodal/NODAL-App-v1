import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { reviewNinjaConnection } from "./actions";

type Props = { searchParams: Promise<{ result?: string | string[] }> };
type Connector = {
  account_count: number;
  connections: string[];
  connector_id: string;
  connector_version: string;
  last_seen_at: string | null;
  owner_display_name: string | null;
  owner_email: string;
  owner_user_id: string;
  paired_at: string;
  status: "active" | "revoked";
};
type Connection = {
  account_count: number;
  connection_name: string;
  connector_id: string;
  review_status: "approved" | "isolated" | null;
};

const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
const messages: Record<string, string> = {
  approved: "Conexión reactivada para el flujo oficial.",
  isolated: "Conexión aislada. Sus cuentas no ingresarán al flujo oficial.",
  invalid_connection: "No se pudo identificar la conexión.",
  not_reviewed: "No se pudo guardar la revisión de la conexión.",
};

function online(lastSeenAt: string | null) {
  return lastSeenAt ? Date.now() - Date.parse(lastSeenAt) <= 60_000 : false;
}

export default async function AdminNinjaPage({ searchParams }: Props) {
  const supabase = await requireNodalAdmin();
  const { result } = await searchParams;
  const [{ data: connectors }, { data: connections }] = await Promise.all([
    supabase.rpc("admin_list_ninja_connectors"),
    supabase.rpc("admin_list_ninja_connector_connections"),
  ]);
  const connectorRows = (connectors ?? []) as Connector[];
  const connectionRows = (connections ?? []) as Connection[];

  return <div className="admin-page admin-shell admin-ninja-page">
    <header className="workspace-view-heading admin-page-heading"><div><p className="status">CONEXIONES NINJA</p><h2>Conectores</h2></div><p>Estado del complemento y conexiones detectadas.</p></header>

    {one(result) && messages[one(result)!] ? <p className={`admin-result ${["approved", "isolated"].includes(one(result) ?? "") ? "success" : "error"}`}>{messages[one(result)!]}</p> : null}

    <section className="admin-user-list admin-connector-summary">
      <div className="admin-section-heading"><div><p className="status">COMPLEMENTOS</p><h3>Conectores vinculados</h3></div><span className="calculated-badge">{connectorRows.length}</span></div>
      {connectorRows.length ? connectorRows.map((connector) => <article className="admin-user-row" key={connector.connector_id}>
        <div>
          <strong>{connector.owner_display_name || connector.owner_email}</strong>
          <span>{connector.owner_email}</span>
          <small>{connector.account_count} cuentas · Versión {connector.connector_version}</small>
        </div>
        <span className={`admin-state ${online(connector.last_seen_at) ? "active_today" : connector.status === "revoked" ? "losing" : "inactive"}`}>{online(connector.last_seen_at) ? "En línea" : connector.status === "revoked" ? "Revocado" : "Sin señal"}</span>
      </article>) : <p className="empty-state">Todavía no se vinculó ningún conector.</p>}
    </section>

    <section className="admin-user-list">
      <div className="admin-section-heading"><div><p className="status">INVENTARIO</p><h3>Conexiones detectadas</h3></div></div>
      {connectionRows.length ? connectionRows.map((connection) => {
        const connector = connectorRows.find((item) => item.connector_id === connection.connector_id);
        const isolated = connection.review_status === "isolated";
        return <article className="admin-user-row" key={`${connection.connector_id}-${connection.connection_name}`}>
          <div>
            <strong>{connection.connection_name}</strong>
            <span>{connector?.owner_display_name || connector?.owner_email || "Usuario no disponible"} · {connection.account_count} cuentas</span>
            <small>{isolated ? "Sus cuentas permanecen separadas." : "Sus cuentas se incorporan automáticamente."}</small>
          </div>
          <form action={reviewNinjaConnection} className="admin-connection-actions">
            <input name="connector_id" type="hidden" value={connection.connector_id} />
            <input name="connection_name" type="hidden" value={connection.connection_name} />
            <input name="reason" type="hidden" value="Revisión de conexión Ninja" />
            <button className="primary-action" disabled={!isolated} name="status" type="submit" value="approved">{isolated ? "Reactivar" : "Activa"}</button>
            <button className="admin-revoke" disabled={isolated} name="status" type="submit" value="isolated">{isolated ? "Aislada" : "Aislar"}</button>
          </form>
        </article>;
      }) : <p className="empty-state">No hay conexiones observadas.</p>}
    </section>
  </div>;
}
