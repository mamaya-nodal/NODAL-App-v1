import Link from "next/link";

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
  return <main className="shell narrow-shell admin-shell"><header className="app-header admin-header"><div className="app-brand-row"><Link className="app-brand" href="/app/admin">NODAL <span>APP</span></Link><span className="development-badge">Administración de accesos</span></div><div className="app-welcome"><div><p className="eyebrow">ALTAS Y BAJAS</p><h1>Alumnos autorizados</h1><p className="summary">El alumno debe iniciar sesión con Google una vez. Después podés habilitarlo y preparar sus espacios desde acá.</p></div></div></header>{one(result) && messages[one(result)!] && <p className={`admin-result ${one(result) === "authorized" || one(result) === "revoked" ? "success" : "error"}`}>{messages[one(result)!]}</p>}<section className="admin-user-grid"><article className="admin-user-form"><p className="status">NUEVO ACCESO</p><h2>Autorizar alumno</h2><form action={authorizeAndProvisionStudent}><label>Correo de Google<input name="email" placeholder="alumno@gmail.com" required type="email" /></label><label>Nombre (opcional)<input name="display_name" placeholder="Nombre del alumno" /></label><label>Primer período<input defaultValue={currentMonth()} name="period_month" required type="date" /></label><label>Motivo<input defaultValue="Alta de alumno" name="reason" required /></label><button className="primary-action" type="submit">Autorizar y preparar espacios</button></form><p>Esto no crea una cuenta Google: la persona debe haber ingresado a NODAL App antes.</p></article><article className="admin-user-list"><p className="status">ACCESOS ACTUALES</p><h2>Usuarios NODAL</h2>{(users ?? []).length === 0 ? <p className="empty-state">Todavía no hay usuarios autorizados.</p> : <div>{(users ?? []).map((user) => <article className="admin-user-row" key={user.id}><div><strong>{user.display_name || user.email}</strong><span>{user.email}</span><small>{user.access_role === "admin" ? "Administrador" : workspaceCount.has(user.id) ? `${workspaceCount.get(user.id)} períodos preparados` : "Sin espacios preparados"}</small></div><div><span className={`admin-state ${user.access_state === "active" ? "active_today" : "inactive"}`}>{user.access_state === "active" ? "Habilitado" : "Revocado"}</span>{user.access_role === "student" && user.access_state === "active" && <form action={revokeStudent}><input name="target_user_id" type="hidden" value={user.id} /><input aria-label={`Motivo de baja de ${user.email}`} defaultValue="Baja de acceso" name="reason" required /><button className="admin-revoke" type="submit">Revocar</button></form>}</div></article>)}</div>}</article></section></main>;
}
