import Image from "next/image";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import styles from "../../public-access.module.css";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) redirect("/");

  const metadata = user.user_metadata ?? {};
  const avatarUrl = typeof metadata.avatar_url === "string"
    ? metadata.avatar_url
    : typeof metadata.picture === "string"
      ? metadata.picture
      : null;
  const suggestedUsername = typeof metadata.username === "string" ? metadata.username : "";

  if (suggestedUsername && avatarUrl) redirect("/app");

  return (
    <main className={styles.profilePage}>
      <section className={styles.profileCard}>
        <Image className={styles.loginLogo} src="/nodal-trading-lime.png" alt="NODAL Trading" width={175} height={50} priority />
        <h1>Completa tu perfil</h1>
        <p>{user.email}</p>
        <CompleteProfileForm avatarUrl={avatarUrl} email={user.email} suggestedUsername={suggestedUsername} />
      </section>
    </main>
  );
}
