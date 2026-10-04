import Image from "next/image";
import { redirect } from "next/navigation";

import { safeAdminNextPath, hasVerifiedMfa } from "@/modules/access/domain/admin-mfa";
import { createClient } from "@/lib/supabase/server";
import styles from "../../public-access.module.css";
import { AdminMfaForm } from "./admin-mfa-form";

type Props = Readonly<{ searchParams: Promise<{ next?: string | string[] }> }>;

export default async function AdminMfaPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const userId = error ? null : claimsData?.claims.sub;
  if (!userId) redirect("/");

  const { data: profile } = await supabase
    .from("nodal_users")
    .select("access_role,access_state")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.access_state !== "active" || profile.access_role !== "admin") {
    redirect("/app");
  }

  const params = await searchParams;
  const next = safeAdminNextPath(typeof params.next === "string" ? params.next : undefined);
  if (hasVerifiedMfa(claimsData?.claims.aal)) redirect(next);

  return (
    <main className={styles.profilePage}>
      <section className={styles.profileCard}>
        <Image alt="NODAL Trading" height={42} priority src="/brand-nodal.png" width={170} />
        <p className={styles.eyebrow}>ACCESO ADMINISTRATIVO</p>
        <h1>Verificación en dos pasos</h1>
        <p>El panel maestro requiere un código temporal además de tu sesión.</p>
        <AdminMfaForm next={next} />
        <form action="/auth/logout" method="post">
          <button className={styles.mfaSecondary} type="submit">Cerrar sesión</button>
        </form>
      </section>
    </main>
  );
}
