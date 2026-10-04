import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SupportTicketForm } from "./support-ticket-form";

export default async function SupportContactPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/app/help/contact");
  const { data: profile } = await supabase
    .from("nodal_users")
    .select("email,display_name,access_state")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.access_state !== "active") redirect("/app");
  return (
    <main className="support-contact-page">
      <header>
        <Link aria-label="Volver a NODAL" href="/app#inicio">
          <Image alt="NODAL Trading" height={32} priority src="/nodal-trading-lime.png" width={178} />
        </Link>
        <Link href="/app#inicio">Volver a la app</Link>
      </header>
      <section className="support-contact-card">
        <span>Ayuda</span>
        <h1>Abrir un ticket</h1>
        <p>Describí el problema y el equipo de NODAL te responderá a {profile.email}.</p>
        <SupportTicketForm email={profile.email} />
      </section>
    </main>
  );
}
