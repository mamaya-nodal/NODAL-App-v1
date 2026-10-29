"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { claimBrokerAccount, discardBrokerAccount } from "./broker-account-actions";

export type PendingBrokerAccountView = Readonly<{
  accountName: string;
  balanceInCents: number | null;
  connectionName: string;
  physicalConnectorId: string;
}>;

type Props = Readonly<{ accounts: PendingBrokerAccountView[] }>;

function money(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(cents / 100);
}

export function BrokerAccountClaims({ accounts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (accounts.length === 0) return null;

  function claim(account: PendingBrokerAccountView) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await claimBrokerAccount(account);
        setMessage(result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage("No se pudo confirmar la cuenta broker. Volvé a intentarlo.");
      }
    });
  }

  function discard(account: PendingBrokerAccountView) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await discardBrokerAccount({ accountName: account.accountName });
        setMessage(result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage("No se pudo descartar la cuenta broker. Volvé a intentarlo.");
      }
    });
  }

  return <section className="broker-account-claims" aria-labelledby="broker-account-claims-title">
    <div>
      <span>CUENTA BROKER DEL USUARIO</span>
      <h3 id="broker-account-claims-title">Confirmación de cuenta broker</h3>
      <p>Es general para tu espacio NODAL. Si el mismo número aparece en otro NinjaTrader, se reconoce como la misma cuenta.</p>
    </div>
    {message ? <p aria-live="polite" className="broker-account-message">{message}</p> : null}
    <div className="broker-account-claim-list">
      {accounts.map((account) => <article className="broker-account-claim" key={`${account.physicalConnectorId}-${account.connectionName}-${account.accountName}`}>
        <span><small>Número de cuenta</small><strong>{account.accountName}</strong></span>
        <span><small>Detectada en</small><strong>{account.connectionName}</strong></span>
        <span><small>Saldo detectado</small><strong>{account.balanceInCents === null ? "Sin lectura" : money(account.balanceInCents)}</strong></span>
        <div className="broker-account-claim-actions">
          <button className="secondary-action" disabled={pending} onClick={() => discard(account)} type="button">Descartar</button>
          <button className="primary-action" disabled={pending} onClick={() => claim(account)} type="button">
            {pending ? "Procesando…" : "Confirmar cuenta broker"}
          </button>
        </div>
      </article>)}
    </div>
  </section>;
}
