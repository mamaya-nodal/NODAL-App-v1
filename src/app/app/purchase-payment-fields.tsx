"use client";

import { useState } from "react";

type WalletOption = Readonly<{ id: string; name: string }>;

export function PurchasePaymentFields({ wallets }: Readonly<{ wallets: WalletOption[] }>) {
  const [source, setSource] = useState<"Aporte trader" | "Saldo generado">("Aporte trader");
  return (
    <>
      <label>Forma de pago
        <select name="funds_origin" onChange={(event) => setSource(event.target.value as typeof source)} value={source}>
          <option value="Aporte trader">Aporte nuevo del trader</option>
          <option disabled={wallets.length === 0} value="Saldo generado">Desde una billetera</option>
        </select>
      </label>
      {source === "Saldo generado" && (
        <label>Billetera
          <select defaultValue="" name="wallet_id" required>
            <option disabled value="">Elegí una billetera</option>
            {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
          </select>
        </label>
      )}
    </>
  );
}
