"use client";

import { useEffect, useState } from "react";

import { MIMICAL_VERSION } from "@/modules/addons/domain/mimical-pilot";

type PairingCode = Readonly<{ code: string; expiresAt: string }>;

type MimicalAddonCardProps = Readonly<{
  enabled: boolean;
  identityId: string | null;
}>;

function MimicalAddonCard({ enabled, identityId }: MimicalAddonCardProps) {
  const [code, setCode] = useState<PairingCode | null>(null);
  const [busy, setBusy] = useState<"code" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    const delay = Math.max(0, new Date(code.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => setCode(null), delay);
    return () => window.clearTimeout(timer);
  }, [code]);

  async function download() {
    setBusy("download");
    setError(null);
    try {
      const response = await fetch("/api/downloads/mimical", { credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "MIMICAL-NodalBots.zip";
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch {
      setError("No se pudo descargar MIMICAL. Intentá nuevamente.");
    } finally {
      setBusy(null);
    }
  }

  async function generateCode() {
    setBusy("code");
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/addons/mimical/pairing-code", {
        body: JSON.stringify({ identityId }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error();
      setCode(await response.json() as PairingCode);
    } catch {
      setError("No se pudo generar el código. Verificá tu sesión e intentá nuevamente.");
    } finally {
      setBusy(null);
    }
  }

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code.code);
    setCopied(true);
  }

  return (
      <article className="addon-card">
        <div className="addon-card-heading">
          <div>
            <p className="status">NODALBOTS</p>
            <h3>MIMICAL</h3>
            <p>Copiador de órdenes y trailing de cobertura para NinjaTrader.</p>
          </div>
          <span className={`addon-pilot-badge ${enabled ? "is-enabled" : ""}`}>
            {enabled ? "Piloto habilitado" : "No habilitado"}
          </span>
        </div>

        {enabled ? (
          <>
            <ol className="addon-steps">
              <li>Descargá e importá el ZIP en NinjaTrader.</li>
              <li>Generá el código desde esta pantalla.</li>
              <li>Abrí MIMICAL en NinjaTrader e ingresá el código una sola vez.</li>
            </ol>
            <div className="addon-actions">
              <button className="secondary-action" disabled={busy !== null} onClick={download} type="button">
                {busy === "download" ? "Preparando…" : `Descargar MIMICAL v${MIMICAL_VERSION}`}
              </button>
              <button className="primary-action" disabled={busy !== null} onClick={generateCode} type="button">
                {busy === "code" ? "Generando…" : code ? "Generar otro código" : "Generar código de vinculación"}
              </button>
            </div>
            {code ? (
              <div className="addon-pairing-code" role="status">
                <span>Código para NinjaTrader</span>
                <strong>{code.code.match(/.{1,4}/g)?.join("-")}</strong>
                <button onClick={copyCode} type="button">{copied ? "Copiado" : "Copiar"}</button>
                <small>Vence a las {new Date(code.expiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} y sólo puede usarse una vez.</small>
              </div>
            ) : null}
            <p className="addon-safety-note">Si tu acceso NODAL deja de estar habilitado, MIMICAL no podrá iniciar ciclos nuevos. Una operación ya iniciada conserva su protección hasta finalizar.</p>
          </>
        ) : <p className="notice">Este complemento todavía no está habilitado para tu usuario.</p>}
        {error ? <p className="purchase-message error" role="alert">{error}</p> : null}
      </article>
  );
}

export function MimicalConfiguration({ enabled }: Readonly<{ enabled: boolean }>) {
  return (
    <section aria-labelledby="configuration-title" className="configuration-view" id="configuracion">
      <div className="workspace-section-heading">
        <div>
          <p className="eyebrow">CONFIGURACIÓN</p>
          <h2 id="configuration-title">Complementos</h2>
        </div>
        <p>Herramientas de NodalBots vinculadas a tu acceso NODAL.</p>
      </div>
      <MimicalAddonCard enabled={enabled} identityId={null} />
    </section>
  );
}

export function IdentityMimicalConfiguration({
  identityId,
  identityName,
  onClose,
}: Readonly<{
  identityId: string;
  identityName: string;
  onClose: () => void;
}>) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div aria-labelledby="identity-configuration-title" aria-modal="true" className="identity-addon-modal-backdrop" onMouseDown={onClose} role="dialog">
      <section className="identity-addon-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">CONFIGURACIÓN</p>
            <h2 id="identity-configuration-title">{identityName}</h2>
          </div>
          <button aria-label="Cerrar configuración" onClick={onClose} type="button">×</button>
        </header>
        <MimicalAddonCard enabled identityId={identityId} />
      </section>
    </div>
  );
}
