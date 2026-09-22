"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { NinjaLiveBrokerBalance } from "@/modules/ninja/domain/live-broker-balance";

import { renameBrokerAccount } from "./broker-account-actions";

type Props = Readonly<{
  accounts: NinjaLiveBrokerBalance["sourceAccounts"];
}>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", { currency: "USD", style: "currency" }).format(cents / 100);
}

export function BrokerAccountBreakdown({ accounts }: Props) {
  const router = useRouter();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (accounts.length < 2) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const accountName = String(formData.get("accountName") ?? "");
    const connectionName = String(formData.get("connectionName") ?? "");
    const displayName = String(formData.get("displayName") ?? "");
    const key = `${connectionName}\u0000${accountName}`;
    setSavingKey(key);
    setMessage(null);
    const result = await renameBrokerAccount({ accountName, connectionName, displayName });
    setSavingKey(null);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <div className="broker-account-breakdown">
      {accounts.map((account) => {
        const key = `${account.connectionName}\u0000${account.accountName}`;
        return (
          <form key={key} onSubmit={submit}>
            <div>
              <input name="connectionName" type="hidden" value={account.connectionName} />
              <input name="accountName" type="hidden" value={account.accountName} />
              <input
                aria-label={`Nombre visible de la cuenta ${account.accountName}`}
                defaultValue={account.displayName ?? ""}
                key={account.displayName ?? "unnamed"}
                maxLength={80}
                name="displayName"
                placeholder="Nombrar cuenta"
                required
              />
              <small>{account.connectionName} · {account.accountName}</small>
            </div>
            <strong>{formatMoney(account.balanceInCents)}</strong>
            <button disabled={savingKey === key} type="submit">
              {savingKey === key ? "Guardando" : "Guardar"}
            </button>
          </form>
        );
      })}
      {message ? <p aria-live="polite">{message}</p> : null}
    </div>
  );
}
