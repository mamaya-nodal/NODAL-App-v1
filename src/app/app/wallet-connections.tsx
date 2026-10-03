"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { NETWORKS } from "@/modules/wallets/domain/stablecoins";
import { evidenceDate, movementMatches } from "@/modules/wallets/domain/matching";
import { createWallet } from "./summary-actions";
import { configureWalletSource, linkWalletObservation, loadWalletSources, refreshWalletSource } from "./wallet-source-actions";
import type { WalletView } from "./progress-summary";

type State = Awaited<ReturnType<typeof loadWalletSources>>;
type Provider = "arq" | "grabrfi" | "global66" | "metamask" | "other";

const PROVIDERS: ReadonlyArray<{ id: Provider; label: string; mode: "Automática" | "Manual" }> = [
  { id: "arq", label: "ARQ", mode: "Manual" },
  { id: "grabrfi", label: "GrabrFi", mode: "Manual" },
  { id: "global66", label: "Global66", mode: "Manual" },
  { id: "metamask", label: "MetaMask", mode: "Automática" },
  { id: "other", label: "Otra", mode: "Manual" },
];

const amount = (cents: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

export function WalletConnections({ defaultDate, maxDate, minDate, periodId, wallets }: {
  defaultDate: string;
  maxDate?: string;
  minDate?: string;
  periodId: string;
  wallets: WalletView[];
}) {
  const router = useRouter();
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [providerDraft, setProviderDraft] = useState<Provider | "">("");
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    let active = true;
    loadWalletSources(periodId)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setMessage("No se pudo cargar la conexión de billeteras."); });
    return () => { active = false; };
  }, [periodId]);

  async function load() {
    try { setData(await loadWalletSources(periodId)); }
    catch { setMessage("No se pudo cargar la conexión de billeteras."); }
  }

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    try { const result = await action(); setMessage(result.message); await load(); }
    catch { setMessage("No se pudo completar la acción."); }
    finally { setBusy(false); }
  }

  function acceptProvider() {
    if (!providerDraft) return;
    setProvider(providerDraft);
    setMessage("");
  }

  async function addWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!provider) return;
    const form = new FormData(event.currentTarget);
    const walletName = String(form.get("wallet_name") ?? "").trim();
    const company = String(form.get("company") ?? "").trim();
    const providerName = provider === "other" ? company : (selected?.label ?? "");
    const name = `${providerName} · ${walletName}`;
    setBusy(true);
    try {
      const created = await createWallet({
        date: String(form.get("date") ?? defaultDate),
        name,
        openingBalance: provider === "metamask" ? "0" : String(form.get("opening_balance") ?? ""),
        periodId,
      });
      if (!created.ok || !created.walletId) {
        setMessage(created.message);
        return;
      }
      if (provider === "metamask") {
        const connected = await configureWalletSource(created.walletId, String(form.get("identity") ?? ""), String(form.get("address") ?? ""));
        setMessage(connected.ok ? "MetaMask conectada." : `La billetera se creó, pero no pudo conectarse. ${connected.message}`);
      } else {
        setMessage(created.message);
      }
      setProvider(null);
      setProviderDraft("");
      await load();
      router.refresh();
    } catch {
      setMessage("No se pudo crear la billetera.");
    } finally {
      setBusy(false);
    }
  }

  const selected = PROVIDERS.find((item) => item.id === provider);
  const connectedSources = data?.sources.filter((source) => source.address) ?? [];
  const observations = data?.observations ?? [];

  return <>
    <details className="wallet-create-inline wallet-add-flow" onToggle={(event) => {
      if (!event.currentTarget.open) { setProvider(null); setProviderDraft(""); setMessage(""); }
    }}>
      <summary>+ Agregar billetera</summary>
      {!provider ? <div className="wallet-provider-picker">
        <select aria-label="Empresa de la billetera" value={providerDraft} onChange={(event) => setProviderDraft(event.target.value as Provider | "")}>
          <option value="">Seleccionar empresa</option>
          {PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.mode}</option>)}
        </select>
        <button disabled={!providerDraft} onClick={acceptProvider} type="button">Aceptar</button>
      </div> : <form className="summary-form wallet-provider-form" key={provider} onSubmit={addWallet}>
        {provider === "other" && <input name="company" placeholder="Empresa" required />}
        <input name="wallet_name" placeholder="Nombre de la billetera" required />
        {provider === "metamask" ? <>
          <select name="identity" defaultValue="" aria-label="Identidad">
            <option value="">Titular / sin identidad asignada</option>
            {data?.identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.first_name} {identity.last_name}</option>)}
          </select>
          <input name="address" placeholder="Dirección pública 0x…" maxLength={42} required />
          <input name="date" type="hidden" value={defaultDate} />
          <button disabled={busy || !data?.configured}>{busy ? "Conectando…" : "Conectar"}</button>
          <small>Solo dirección pública. Nunca ingreses claves privadas.</small>
          <details className="wallet-network-help"><summary>Ver redes compatibles</summary>
            <span>{NETWORKS.map((network) => network.name).join(" · ")} · USDT/USDC</span>
          </details>
        </> : <>
          <input defaultValue={defaultDate} max={maxDate} min={minDate} name="date" required type="date" />
          <input inputMode="decimal" name="opening_balance" placeholder="Saldo inicial USD" />
          <button disabled={busy}>{busy ? "Creando…" : "Crear billetera"}</button>
        </>}
        <button className="wallet-flow-back" onClick={() => setProvider(null)} type="button">Volver</button>
      </form>}
      {message && <small className="wallet-flow-message" role="status">{message}</small>}
    </details>

    {connectedSources.length > 0 && <section className="wallet-connected-list" aria-label="Billeteras conectadas">
      {connectedSources.map((source) => {
        const wallet = wallets.find((item) => item.id === source.wallet_id);
        return <article className="wallet-connection-card" key={source.wallet_id}>
          <div><strong>{wallet?.name}</strong><span>{source.observed_cents === null ? "Sin lectura" : `USDT/USDC ${amount(source.observed_cents)}`}</span></div>
          <button type="button" disabled={busy || !data?.configured} onClick={() => void run(() => refreshWalletSource(source.wallet_id))}>Actualizar</button>
        </article>;
      })}
    </section>}

    {observations.length > 0 && <section className="wallet-observation-list">
      <h4>Movimientos detectados</h4>
      {observations.map((observation) => {
        const linked = observation.movement_id || observation.payout_id;
        const movements = data?.movements.filter((movement) => movementMatches(observation, movement)) ?? [];
        const payouts = data?.payouts.filter((payout) => observation.direction === "in" && payout.wallet_id === observation.wallet_id && payout.collected_on === evidenceDate(observation.occurred_at) && payout.amount_cents - payout.collection_fee_cents === observation.amount_cents) ?? [];
        return <article className="wallet-connection-card" key={observation.id}>
          <div><strong>{wallets.find((wallet) => wallet.id === observation.wallet_id)?.name}</strong><span>{observation.direction === "in" ? "+" : observation.direction === "out" ? "−" : ""}{amount(observation.amount_cents)} {observation.symbol}</span></div>
          {linked ? <small>Vinculado</small> : data?.open && observation.direction !== "self" && movements.length + payouts.length ?
            <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => linkWalletObservation(observation.id, String(form.get("record")))); }}>
              <select name="record" required defaultValue=""><option value="" disabled>Vincular con…</option>
                {movements.map((movement) => <option key={movement.id} value={`movement:${movement.id}`}>Movimiento · {movement.occurred_on}</option>)}
                {payouts.map((payout) => <option key={payout.id} value={`payout:${payout.id}`}>Payout · {payout.collected_on}</option>)}
              </select><button disabled={busy}>Vincular</button>
            </form> : <small>Pendiente</small>}
        </article>;
      })}
    </section>}
  </>;
}
