"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { OpeningAccountStage } from "@/modules/summary/domain/opening-snapshot";
import { readOpeningBrokerState } from "@/modules/ninja/server/opening-broker-state";

type Result = Readonly<{ ok: boolean; message: string }>;
type BatchInput = Readonly<{
  accountCount: string;
  accountSize: string;
  companyName: string;
  costPerAccount: string;
  currentCashValue: string;
  stage: OpeningAccountStage;
}>;
export type OpeningSetupInput = Readonly<{
  batches: BatchInput[];
  closedAccounts: string;
  contributedCapital: string;
  fundedAccounts: string;
  liveEvaluationAccounts: string;
  mode: "reconstruct" | "zero";
  pendingPayouts: string;
  periodId: string;
  personalWithdrawals: string;
  reconstructionDate: string;
  virginAccounts: string;
  wallets: ReadonlyArray<Readonly<{ balance: string; name: string }>>;
  workingCapital: string;
}>;

const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function cents(value: string, signed = false): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const pattern = signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(normalized)) return null;
  const result = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(result) ? result : null;
}

function count(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function confirmOpeningSetup(input: OpeningSetupInput): Promise<Result> {
  if (!uuid(input.periodId) || !input.reconstructionDate || !["zero", "reconstruct"].includes(input.mode)) {
    return { ok: false, message: "Revisá el período y la fecha de inicio." };
  }

  const money = {
    contributed: cents(input.contributedCapital),
    floating: cents(input.workingCapital),
    pending: cents(input.pendingPayouts),
    withdrawals: cents(input.personalWithdrawals),
  };
  const accounts = {
    closed: count(input.closedAccounts),
    funded: count(input.fundedAccounts),
    live: count(input.liveEvaluationAccounts),
    virgin: count(input.virginAccounts),
  };
  if (Object.values(money).some((value) => value === null) || Object.values(accounts).some((value) => value === null)) {
    return { ok: false, message: "Revisá los importes y las cantidades ingresadas." };
  }

  const wallets = input.wallets.flatMap((wallet) => {
    if (!wallet.name.trim() && !wallet.balance.trim()) return [];
    const balanceInCents = cents(wallet.balance);
    if (!wallet.name.trim() || balanceInCents === null) return [null];
    return [{ balanceInCents, name: wallet.name.trim() }];
  });
  const walletNames = wallets.flatMap((wallet) => wallet ? [wallet.name.toLocaleLowerCase("es")] : []);
  if (wallets.some((wallet) => wallet === null) || new Set(walletNames).size !== walletNames.length) {
    return { ok: false, message: "Completá nombre y saldo de cada billetera, sin repetir nombres." };
  }

  const batches = input.batches.flatMap((batch) => {
    if (!batch.companyName.trim() && !batch.accountCount.trim()) return [];
    const accountCount = count(batch.accountCount);
    const accountSizeInCents = cents(batch.accountSize);
    const costPerAccountInCents = cents(batch.costPerAccount);
    const currentCashValueInCents = batch.currentCashValue.trim() ? cents(batch.currentCashValue) : null;
    if (!batch.companyName.trim() || !accountCount || !accountSizeInCents || costPerAccountInCents === null || (batch.currentCashValue.trim() && currentCashValueInCents === null)) return [null];
    return [{
      accountCount,
      accountSizeInCents,
      companyName: batch.companyName.trim(),
      costPerAccountInCents,
      currentCashValueInCents,
      stage: batch.stage,
    }];
  });
  if (batches.some((batch) => batch === null)) {
    return { ok: false, message: "Completá todos los datos del lote de cuentas o dejalo vacío." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció." };
  let brokerState;
  try { brokerState = await readOpeningBrokerState(supabase, user.id); }
  catch { return { ok: false, message: "No se pudo comprobar el saldo broker. Volvé a intentar." }; }
  const liveBroker = brokerState.liveBrokerBalance;
  if (!liveBroker) {
    return {
      ok: false,
      message: brokerState.pendingAccounts.length > 0
        ? "NODAL recibió tus cuentas broker. Confirmá cuáles son tuyas con «Es mía» antes de continuar."
        : "Conectá NinjaTrader para que NODAL tome el saldo broker antes de confirmar.",
    };
  }
  const { error } = await supabase.rpc("confirm_nodal_period_opening_after_connector", {
    target_batches: batches,
    target_broker_balance_cents: liveBroker.balanceInCents,
    target_closed_accounts_reference: accounts.closed,
    target_contributed_capital_cents: money.contributed,
    target_cutover_date: input.reconstructionDate,
    target_floating_cents: money.floating,
    target_funded_accounts: accounts.funded,
    target_funding_pending_cents: money.pending,
    target_live_evaluation_accounts: accounts.live,
    target_period_id: input.periodId,
    target_personal_withdrawals_cents: money.withdrawals,
    target_start_mode: input.mode,
    target_virgin_accounts: accounts.virgin,
    target_wallets: wallets,
  });
  if (error) {
    if (error.message.includes("already confirmed")) return { ok: false, message: "Este punto de partida ya fue confirmado." };
    if (error.message.includes("after period activity")) return { ok: false, message: "Ya existe actividad en el período. La apertura inicial no puede mezclarse con registros posteriores." };
    return { ok: false, message: "No se pudo confirmar el punto de partida." };
  }

  revalidatePath("/app");
  return { ok: true, message: "Punto de partida guardado. El panel ya refleja la apertura." };
}
