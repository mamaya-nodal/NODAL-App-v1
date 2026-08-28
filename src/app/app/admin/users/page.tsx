import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { authorizeAndProvisionStudent, revokeStudent } from "../user-actions";

type Props = { searchParams: Promise<{ result?: string | string[] }> };
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}
const messages: Record<string, string> = {
  authorized: "Alumno autorizado y espacios Real y Práctica preparados.", invalid: "Completá correo, período y motivo.", not_authorized: "No se pudo autorizar. La persona debe haber iniciado sesión con Google primero.", not_revoked: "No se pudo revocar este acceso.", revoked: "Acceso del alumno revocado. Sus registros se conservan.",
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const supabase = await requireNodalAdmin();
  const { result } = await searchParams;
  const [{ data: users }, { data: workspaces }] = await Promise.all([
    supabase.from("nodal_users").select("id, email, display_name, access_state, access_role, authorized_at, revoked_at").order("created_at", { ascending: false }),
    supabase.from("workspaces").select("owner_user_id, modality, periods(id)")
  ]);
  const workspaceCount = new Map((workspaces ?? []).map((workspace) => [workspace.owner_user_id, workspace.periods.length]));
  return <div className="admin-page admin-shell">
    <header className="workspace-view-heading admin-page-heading"><div><p className="status">ACCESOS</p><h2>Alumnos</h2></div><p>Altas, bajas y espacios habilitados.</p></header>
    {one(result) && messages[one(result)!] && <p className={`admin-result ${one(result) === "authorized" || one(result) === "revoked" ? "success" : "error"}`}>{messages[one(result)!]}</p>}
    <section className="admin-user-grid">
      <article className="admin-user-form"><p className="status">NUEVO ACCESO</p><h2>Autorizar alumno</h2><form action={authorizeAndProvisionStudent}><label>Correo de Google<input name="email" placeholder="alumno@gmail.com" required type="email" /></label><label>Nombre (opcional)<input name="display_name" placeholder="Nombre del alumno" /></label><label>Primer período<input defaultValue={currentMonth()} name="period_month" required type="date" /></label><label>Motivo<input defaultValue="Alta de alumno" name="reason" required /></label><button className="primary-action" type="submit">Autorizar y preparar espacios</button></form></article>
      <article className="admin-user-list"><div className="admin-section-heading"><div><p className="status">ACCESOS ACTUALES</p><h3>Usuarios NODAL</h3></div><span className="calculated-badge">{(users ?? []).length}</span></div>{(users ?? []).length === 0 ? <p className="empty-state">Todavía no hay usuarios autorizados.</p> : <div>{(users ?? []).map((user) => <article className="admin-user-row" key={user.id}><div><strong>{user.display_name || user.email}</strong><span>{user.email}</span><small>{user.access_role === "admin" ? "Administrador" : workspaceCount.has(user.id) ? `${workspaceCount.get(user.id)} períodos preparados` : "Sin espacios preparados"}</small></div><div><span className={`admin-state ${user.access_state === "active" ? "active_today" : "inactive"}`}>{user.access_state === "active" ? "Habilitado" : "Revocado"}</span>{user.access_role === "student" && user.access_state === "active" && <form action={revokeStudent}><input name="target_user_id" type="hidden" value={user.id} /><input aria-label={`Motivo de baja de ${user.email}`} defaultValue="Baja de acceso" name="reason" required /><button className="admin-revoke" type="submit">Revocar</button></form>}</div></article>)}</div>}</article>
    </section>
  </div>;
}
