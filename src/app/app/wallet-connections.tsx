"use client";

import { useState, type FormEvent } from "react";
import { NETWORKS } from "@/modules/wallets/domain/stablecoins";
import { evidenceDate, movementMatches } from "@/modules/wallets/domain/matching";
import { configureWalletSource, linkWalletObservation, loadWalletSources, refreshWalletSource } from "./wallet-source-actions";
import type { WalletView } from "./progress-summary";

type State = Awaited<ReturnType<typeof loadWalletSources>>;
const amount = (cents: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

export function WalletConnections({ periodId, wallets }: { periodId: string; wallets: WalletView[] }) {
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    try { setData(await loadWalletSources(periodId)); }
    catch { setMessage("No se pudo cargar la configuración de billeteras. Intentá nuevamente."); }
  }
  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    try { const result = await action(); setMessage(result.message); await load(); }
    catch { setMessage("No se pudo completar la acción. No se registró un nuevo movimiento contable."); }
    finally { setBusy(false); }
  }
  function configure(event: FormEvent<HTMLFormElement>, walletId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() => configureWalletSource(walletId, String(form.get("identity") ?? ""), String(form.get("address") ?? "")));
  }
  return <details className="wallet-create-inline wallet-connections" onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary>Identidades y conexión de billeteras</summary>
    <p>Las billeteras manuales mantienen sus movimientos actuales. Para MetaMask o Trust Wallet, vinculá la dirección pública de cada cuenta por separado. Nunca ingreses semillas ni claves privadas.</p>
    {message && <p role="status">{message}</p>}
    {!data ? <button type="button" onClick={() => void load()}>Cargar configuración</button> : <>
      {!data.configured && <p role="status">Lectura automática pendiente de configuración del proveedor. Todavía no está activa.</p>}
      <details><summary>Redes y monedas consultadas</summary>
        <p>{NETWORKS.map((network) => `${network.name}: ${network.tokens.map((token) => token.symbol).join(" / ")}`).join(" · ")}</p>
        <p>USDT0 es la representación de USDT incluida en Arbitrum y Polygon. No se incluyen BTC, ETH, otras redes, tokens puenteados distintos ni fondos en protocolos. Tron, Solana y BNB Chain todavía no están cubiertas.</p>
      </details>
      {wallets.map((wallet) => {
        const source = data.sources.find((item) => item.wallet_id === wallet.id);
        return <article className="wallet-connection-card" key={wallet.id}>
          <h4>{wallet.name} · {source?.address ? "Lectura cripto" : "Registro manual"}</h4>
          <form className="summary-form" onSubmit={(event) => configure(event, wallet.id)}>
            <label>Identidad<select key={`${wallet.id}-${source?.identity_id}`} name="identity" defaultValue={source?.identity_id ?? ""}>
              <option value="">Titular / sin identidad asignada</option>
              {data.identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.first_name} {identity.last_name}</option>)}
            </select></label>
            <label>Dirección pública EVM (opcional)<input name="address" defaultValue={source?.address ?? ""} readOnly={Boolean(source?.address)} placeholder="0x… · dejar vacío para billetera manual" maxLength={42} /></label>
            <button disabled={busy}>Guardar configuración</button>
          </form>
          {source?.address && <>
            <div className="wallet-reading"><span>Saldo contable: US$ {amount(wallet.balanceInCents)}</span>
              <strong>USDT + USDC detectados: {source.observed_cents === null ? "Sin lectura" : amount(source.observed_cents)}</strong></div>
            <small>Suma nominal de tokens admitidos, no cotización USD. No reemplaza el saldo contable ni genera un aporte inicial.</small>
            <p>{source.observed_at ? `Última lectura: ${new Date(source.observed_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}` : "Sin lectura confirmada."} {source.last_error}</p>
            <small>Se detectan movimientos desde la vinculación de esta dirección. El saldo anterior requiere revisar su origen y los registros iniciales.</small>
            <button type="button" disabled={busy || !data.configured} onClick={() => void run(() => refreshWalletSource(wallet.id))}>Actualizar lectura</button>
          </>}
        </article>;
      })}
      <h4>Movimientos detectados</h4>
      <p>Primero registrá el concepto en «Movimientos de billetera» o confirmá el cobro en «Payouts». Después vinculalo aquí. Vincular no vuelve a sumar el importe.</p>
      {!data.observations.length && <p>No hay movimientos detectados. No se importa el historial anterior a la conexión.</p>}
      {data.observations.map((observation) => {
        const linked = observation.movement_id || observation.payout_id;
        const movements = data.movements.filter((movement) => movementMatches(observation, movement));
        const payouts = data.payouts.filter((payout) => observation.direction === "in" && payout.wallet_id === observation.wallet_id && payout.collected_on === evidenceDate(observation.occurred_at) && payout.amount_cents - payout.collection_fee_cents === observation.amount_cents);
        return <article className="wallet-connection-card" key={observation.id}>
          <strong>{wallets.find((wallet) => wallet.id === observation.wallet_id)?.name} · {observation.direction === "in" ? "Entrada" : observation.direction === "out" ? "Salida" : "Transferencia a sí misma"} · {amount(observation.amount_cents)} {observation.symbol}</strong>
          <small>{evidenceDate(observation.occurred_at)} · {observation.chain} · {observation.tx_hash}</small>
          {linked ? <p>Vinculado · sin duplicar contabilidad</p> : !data.open || observation.direction === "self" ? <p>Pendiente de revisión · no genera asiento automático</p> : movements.length + payouts.length ?
            <form className="summary-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => linkWalletObservation(observation.id, String(form.get("record")))); }}>
              <select name="record" required defaultValue=""><option value="" disabled>Seleccionar registro coincidente</option>
                {movements.map((movement) => <option key={movement.id} value={`movement:${movement.id}`}>Movimiento · {movement.occurred_on} · {amount(observation.amount_cents)} · {movement.id.slice(0, 8)}</option>)}
                {payouts.map((payout) => <option key={payout.id} value={`payout:${payout.id}`}>Cobro de payout · {payout.collected_on} · {amount(observation.amount_cents)} · {payout.id.slice(0, 8)}</option>)}
              </select><button disabled={busy}>Vincular sin duplicar</button>
            </form> : <p>Pendiente de identificar: no hay un registro coincidente en este período. No se ajustará el saldo automáticamente.</p>}
        </article>;
      })}
      {data.observations.length === 100 && <p>Se muestran los últimos 100 movimientos. Los anteriores se conservan.</p>}
    </>}
  </details>;
}
