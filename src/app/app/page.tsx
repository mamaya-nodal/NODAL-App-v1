import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { decideAccess } from "@/modules/access/domain/access-decision";

export default async function PrivateAppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: nodalUser } = await supabase
    .from("nodal_users")
    .select("id, email, access_state")
    .eq("id", user.id)
    .maybeSingle();

  const decision = decideAccess(
    user.id,
    nodalUser
      ? { id: nodalUser.id, accessState: nodalUser.access_state }
      : null,
  );
  const allowed = decision === "allowed";

  return (
    <main className="shell narrow-shell">
      <section className="hero" aria-labelledby="private-title">
        <p className="eyebrow">NODAL APP · ACCESO PRIVADO</p>
        <h1 id="private-title">
          {allowed ? "Acceso autorizado." : "Identidad verificada."}
        </h1>
        <p className="summary">
          {allowed
            ? "Tu usuario esta habilitado para ingresar al espacio NODAL."
            : "Google confirmo quien sos, pero este usuario todavia no tiene permiso para operar dentro de NODAL."}
        </p>
      </section>

      <section className="panel single-panel" aria-live="polite">
        <div>
          <p className="status">ESTADO DEL ACCESO</p>
          <h2>{allowed ? "Habilitado" : "Pendiente de autorizacion"}</h2>
        </div>
        <div>
          <p className="summary compact">
            Usuario identificado: {user.email ?? "correo no disponible"}
          </p>
          {!allowed && (
            <p className="notice">
              Este bloqueo es intencional: iniciar sesion con Google no concede
              acceso automatico a la informacion de NODAL.
            </p>
          )}
        </div>
      </section>

      <form action="/auth/logout" method="post">
        <button className="secondary-action" type="submit">
          Cerrar sesion
        </button>
      </form>
    </main>
  );
}
