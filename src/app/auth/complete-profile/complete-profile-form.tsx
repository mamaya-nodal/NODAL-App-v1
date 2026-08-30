"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import styles from "../../public-access.module.css";

type CompleteProfileFormProps = {
  avatarUrl: string | null;
  email: string;
  suggestedUsername: string;
};

export function CompleteProfileForm({ avatarUrl, email, suggestedUsername }: CompleteProfileFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(avatarUrl);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    const avatar = form.get("avatar");
    const supabase = createClient();
    let nextAvatarUrl = avatarUrl;

    if (avatar instanceof File && avatar.size > 0) {
      if (avatar.size > 2 * 1024 * 1024) {
        setError("La imagen debe pesar menos de 2 MB.");
        setBusy(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.assign("/");
        return;
      }

      const extension = avatar.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userData.user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(path, avatar, { cacheControl: "3600", contentType: avatar.type, upsert: true });

      if (uploadError) {
        setError("No pudimos guardar la foto.");
        setBusy(false);
        return;
      }

      nextAvatarUrl = supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: nextAvatarUrl, username },
    });

    if (updateError) {
      setError("No pudimos completar el perfil.");
      setBusy(false);
      return;
    }

    window.location.assign("/app");
  }

  return (
    <form className={styles.profileForm} onSubmit={submit}>
      <div className={styles.profileAvatar}>
        {preview ? <img alt="Foto de perfil" src={preview} /> : <span>{email.slice(0, 1).toUpperCase()}</span>}
      </div>
      <label className={styles.profilePhotoAction}>
        Elegir foto
        <input accept="image/jpeg,image/png,image/webp" name="avatar" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setPreview(URL.createObjectURL(file));
        }} type="file" />
      </label>
      <label>Nombre de usuario<input autoCapitalize="none" autoComplete="username" defaultValue={suggestedUsername} minLength={3} name="username" pattern="[A-Za-z0-9._-]+" required /></label>
      {error ? <p className={styles.authError} role="alert">{error}</p> : null}
      <button className={styles.authSubmit} disabled={busy} type="submit">{busy ? "Guardando..." : "Continuar"}</button>
    </form>
  );
}
