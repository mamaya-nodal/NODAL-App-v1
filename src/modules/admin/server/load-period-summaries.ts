import type {
  FundingWithdrawal,
  OperationalSummary,
  WalletMovement,
} from "@/modules/summary/domain/operational-summary";
import { buildOperationalSummary } from "@/modules/summary/domain/operational-summary";
import type { AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";

type Supabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

export type LoadedPeriodSummary = Readonly<{
  lastOperatedOn: string | null;
  summary: OperationalSummary;
}>;

export async function loadPeriodSummaries(
  supabase: Supabase,
  periodIds: readonly string[],
): Promise<Map<string, LoadedPeriodSummary>> {
  const result = new Map<string, LoadedPeriodSummary>();
  if (periodIds.length === 0) return result;

  const [accountsResult, purchasesResult, controlsResult, entriesResult, withdrawalsResult, walletResult, fundingResult] = await Promise.all([
    supabase.from("accounts").select("id, period_id, state, state_origin").in("period_id", periodIds),
    supabase.from("purchases").select("account_id, period_id, price_cents, funds_origin").in("period_id", periodIds),
    supabase.from("daily_controls").select("period_id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents").in("period_id", periodIds),
    supabase.from("operation_entries").select("id, period_id, account_id, operated_on, phase, participant_role, destination, magnitude_cents").in("period_id", periodIds),
    supabase.from("account_phase_withdrawals").select("period_id, account_id, phase, total_withdrawal_cents").in("period_id", periodIds),
    supabase.from("wallet_movements").select("id, period_id, occurred_on, kind, amount_cents, observation").in("period_id", periodIds),
    supabase.from("funding_withdrawals").select("id, period_id, account_id, approved_on, amount_cents, collected_on").eq("is_active", true).in("period_id", periodIds),
  ]);

  const accounts = accountsResult.data ?? [];
  const purchases = purchasesResult.data ?? [];
  const controls = controlsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const phaseWithdrawals = withdrawalsResult.data ?? [];
  const walletMovements = walletResult.data ?? [];
  const fundingWithdrawals = fundingResult.data ?? [];

  for (const periodId of periodIds) {
    const accountsForPeriod = accounts.filter((account) => account.period_id === periodId);
    const purchasesByAccount = new Map(
      purchases
        .filter((purchase) => purchase.period_id === periodId)
        .map((purchase) => [purchase.account_id, purchase]),
    );
    const entriesForPeriod: OperationRegisterEntry[] = entries
      .filter((entry) => entry.period_id === periodId)
      .map((entry) => ({
        accountId: entry.account_id,
        accountReference: 0,
        companyId: "",
        companyName: "",
        dailyControlId: "",
        destination: entry.destination,
        id: entry.id,
        magnitudeInCents: Number(entry.magnitude_cents),
        operatedOn: entry.operated_on,
        participantRole: entry.participant_role,
        phase: entry.phase,
      }));
    const phaseWithdrawalsForPeriod: AccountPhaseWithdrawal[] = phaseWithdrawals
      .filter((withdrawal) => withdrawal.period_id === periodId && withdrawal.phase !== "Evaluacion")
      .map((withdrawal) => ({
        accountId: withdrawal.account_id,
        phase: withdrawal.phase as AccountPhaseWithdrawal["phase"],
        totalWithdrawalInCents: Number(withdrawal.total_withdrawal_cents),
      }));
    const walletForPeriod: WalletMovement[] = walletMovements
      .filter((movement) => movement.period_id === periodId)
      .map((movement) => ({
        amountInCents: Number(movement.amount_cents),
        id: movement.id,
        kind: movement.kind as WalletMovement["kind"],
        occurredOn: movement.occurred_on,
        observation: movement.observation,
      }));
    const fundingForPeriod: FundingWithdrawal[] = fundingWithdrawals
      .filter((withdrawal) => withdrawal.period_id === periodId)
      .map((withdrawal) => ({
        accountId: withdrawal.account_id,
        amountInCents: Number(withdrawal.amount_cents),
        approvedOn: withdrawal.approved_on,
        collectedOn: withdrawal.collected_on,
        id: withdrawal.id,
      }));
    const controlsForPeriod = controls.filter((control) => control.period_id === periodId);
    const operatingDates = controlsForPeriod
      .filter((control) => control.kind === "balance_update")
      .map((control) => control.operated_on)
      .sort();
    result.set(periodId, {
      lastOperatedOn: operatingDates.at(-1) ?? null,
      summary: buildOperationalSummary({
        accounts: accountsForPeriod.map((account) => {
          const purchase = purchasesByAccount.get(account.id);
          return {
            fundsOrigin: purchase?.funds_origin === "Saldo generado" ? "Saldo generado" : "Aporte trader",
            id: account.id,
            priceInCents: Number(purchase?.price_cents ?? 0),
            state: account.state,
            stateOrigin: account.state_origin,
          };
        }),
        controls: controlsForPeriod.map((control) => ({
          balanceAfterInCents: Number(control.balance_after_cents),
          controlNumber: control.control_number,
          kind: control.kind,
          movementInCents: control.movement_cents === null ? null : Number(control.movement_cents),
          operatingResultInCents: control.operating_result_cents === null ? null : Number(control.operating_result_cents),
          originDestination: control.origin_destination,
        })),
        entries: entriesForPeriod,
        fundingWithdrawals: fundingForPeriod,
        phaseWithdrawals: phaseWithdrawalsForPeriod,
        walletMovements: walletForPeriod,
      }),
    });
  }
  return result;
}
