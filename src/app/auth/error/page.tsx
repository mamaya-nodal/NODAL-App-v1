type Props = {
  searchParams: Promise<{ reason?: string | string[] }>;
};

const messages = {
  provider: "Google no pudo autorizar el acceso. Revisá la cuenta elegida e intentá nuevamente.",
  session: "Google autorizó el acceso, pero no se pudo crear la sesión segura. Intentá una vez más; si se repite, NODAL debe revisar la conexión.",
} as const;

export default async function AuthErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const message = typeof reason === "string" && reason in messages
    ? messages[reason as keyof typeof messages]
    : "La identidad de Google no pudo verificarse. Volvé a intentar o comunicate con NODAL si el problema continúa.";

  return (
    <main className="recovery-page recovery-card">
      <h1>No se pudo completar el acceso</h1>
      <p>{message}</p>
    </main>
  );
}
