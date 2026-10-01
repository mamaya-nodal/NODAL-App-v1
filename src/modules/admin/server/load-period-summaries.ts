import type {
  FundingWithdrawal,
  OperationalSummary,
  WalletMovement,
} from "@/modules/summary/domain/operational-summary";
import { buildOperationalSummary } from "@/modules/summary/domain/operational-summary";
import { applyIndividualCommission } from '@/modules/summary/domain/individual-commission';
import { readAll } from './read-all';
import { loadIndividualCommission } from '@/modules/summary/server/individual-commission';
import type { AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { operationalOpeningFromRecord, type PeriodOpeningRecord } from "@/modules/summary/domain/opening-snapshot";

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
  options?: Readonly<{
    loadCommission?: (userId: string, month: string) => Promise<number | null>;
  }>,
): Promise<Map<string, LoadedPeriodSummary>> {
  const result = new Map<string, LoadedPeriodSummary>();
  if(periodIds.length>100){
    for(let i=0;i<periodIds.length;i+=100){
      const batch=await loadPeriodSummaries(supabase,periodIds.slice(i,i+100),options);
      for(const [id,summary] of batch)result.set(id,summary);
    }
    return result;
  }
  if (periodIds.length === 0) return result;

  const [accountsResult, controlsResult, walletResult, fundingResult, openingResult, carryoversResult, closuresResult] = await Promise.all([
    readAll(supabase.from("accounts").select("id, period_id, state, state_origin").in("period_id", periodIds).order("id")),
    readAll(supabase.from("daily_controls").select("period_id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, is_uncovered, transfer_fee_cents").in("period_id", periodIds).order("id")),
    readAll(supabase.from("wallet_movements").select("id, period_id, wallet_id, destination_wallet_id, occurred_on, kind, amount_cents, fee_cents, observation").in("period_id", periodIds).order("id")),
    readAll(supabase.from("funding_withdrawals").select("id, period_id, account_id, approved_on, amount_cents, collected_on, wallet_id, collection_fee_cents").eq("is_active", true).in("period_id", periodIds).order("id")),
    readAll(supabase.from("period_opening_snapshots").select("id,period_id,start_mode,cutover_date,broker_balance_cents,wallet_balance_cents,funding_pending_cents,contributed_capital_cents,personal_withdrawals_cents,prior_realized_result_cents,floating_cents,virgin_accounts,live_evaluation_accounts,funded_accounts,closed_accounts_reference").in("period_id", periodIds).order("id")),
    readAll(supabase.from("account_period_carryovers").select("to_period_id,account_id,lifetime_result_cents").in("to_period_id", periodIds).order("id")),
    readAll(supabase.from("period_closure_versions").select("period_id,version,summary_data").in("period_id", periodIds).order("version", { ascending: false })),
  ]);

  const accounts = accountsResult.data ?? [];
  const controls = controlsResult.data ?? [];
  const walletMovements = walletResult.data ?? [];
  const fundingWithdrawals = fundingResult.data ?? [];
  const openings = openingResult.data ?? [];
  const carryovers = carryoversResult.data ?? [];
  const closures = closuresResult.data ?? [];
  const failed=[accountsResult,controlsResult,walletResult,fundingResult,openingResult,carryoversResult,closuresResult].find(r=>r.error);
  if(failed)throw new Error('No se pudieron verificar los importes del período.');
  const accountIds = accounts.map((account) => account.id);
  const [purchasesResult, entriesResult, withdrawalsResult] = accountIds.length > 0
    ? await Promise.all([
        readAll(supabase.from("purchases").select("account_id,period_id,price_cents,funds_origin").in("account_id", accountIds).order("id")),
        readAll(supabase.from("operation_entries").select("id,period_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents").in("account_id", accountIds).order("id")),
        readAll(supabase.from("account_phase_withdrawals").select("period_id,account_id,phase,total_withdrawal_cents").in("account_id", accountIds).order("id")),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (purchasesResult.error || entriesResult.error || withdrawalsResult.error) {
    throw new Error('No se pudo reconstruir la vida completa de las cuentas.');
  }
  const purchases = purchasesResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const phaseWithdrawals = withdrawalsResult.data ?? [];
  const {data:periodOwners,error:ownersError}=await supabase.from('periods').select('id,period_month,lifecycle_status,workspaces(owner_user_id)').in('id',periodIds);
  if(ownersError)throw new Error('No se pudieron verificar los períodos.');
  const commissionLoader = options?.loadCommission ?? loadIndividualCommission;
  const agreements=new Map(await Promise.all((periodOwners??[]).map(async p=>{
    const workspace=Array.isArray(p.workspaces)?p.workspaces[0]:p.workspaces;
    return [p.id,workspace?await commissionLoader(workspace.owner_user_id,p.period_month):null] as const;
  })));
  const latestClosureByPeriod = new Map<string, OperationalSummary>();
  for (const closure of closures) {
    if (latestClosureByPeriod.has(closure.period_id)) continue;
    if (closure.summary_data && typeof closure.summary_data === "object" && !Array.isArray(closure.summary_data)) {
      latestClosureByPeriod.set(closure.period_id, closure.summary_data as unknown as OperationalSummary);
    }
  }

  for (const periodId of periodIds) {
    const controlsForPeriod = controls.filter((control) => control.period_id === periodId);
    const operatingDates = controlsForPeriod
      .filter((control) => control.kind === "balance_update")
      .map((control) => control.operated_on)
      .sort();
    const closedSummary = latestClosureByPeriod.get(periodId);
    if (closedSummary) {
      result.set(periodId, {
        lastOperatedOn: operatingDates.at(-1) ?? null,
        summary: closedSummary,
      });
      continue;
    }
    const accountsForPeriod = accounts.filter((account) => account.period_id === periodId);
    const accountIdsForPeriod = new Set(accountsForPeriod.map((account) => account.id));
    const purchasesByAccount = new Map(
      purchases
        .filter((purchase) => accountIdsForPeriod.has(purchase.account_id))
        .map((purchase) => [purchase.account_id, purchase]),
    );
    const entriesForPeriod: OperationRegisterEntry[] = entries
      .filter((entry) => accountIdsForPeriod.has(entry.account_id))
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
      .filter((withdrawal) => accountIdsForPeriod.has(withdrawal.account_id) && withdrawal.phase !== "Evaluacion")
      .map((withdrawal) => ({
        accountId: withdrawal.account_id,
        phase: withdrawal.phase as AccountPhaseWithdrawal["phase"],
        totalWithdrawalInCents: Number(withdrawal.total_withdrawal_cents),
      }));
    const walletForPeriod: WalletMovement[] = walletMovements
      .filter((movement) => movement.period_id === periodId)
      .map((movement) => ({
        amountInCents: Number(movement.amount_cents),
        destinationWalletId: movement.destination_wallet_id,
        id: movement.id,
        kind: movement.kind as WalletMovement["kind"],
        occurredOn: movement.occurred_on,
        observation: movement.observation,
        feeInCents: Number(movement.fee_cents ?? 0),
        walletId: movement.wallet_id,
      }));
    const fundingForPeriod: FundingWithdrawal[] = fundingWithdrawals
      .filter((withdrawal) => withdrawal.period_id === periodId)
      .map((withdrawal) => ({
        accountId: withdrawal.account_id,
        amountInCents: Number(withdrawal.amount_cents),
        approvedOn: withdrawal.approved_on,
        collectedOn: withdrawal.collected_on,
        feeInCents: Number(withdrawal.collection_fee_cents ?? 0),
        id: withdrawal.id,
        walletId: withdrawal.wallet_id,
      }));
    const openingRow = openings.find((opening) => opening.period_id === periodId);
    const baseOpening = openingRow ? operationalOpeningFromRecord({
      batches: [],
      brokerBalanceInCents: openingRow.broker_balance_cents === null ? null : Number(openingRow.broker_balance_cents),
      closedAccountsReference: Number(openingRow.closed_accounts_reference),
      contributedCapitalInCents: Number(openingRow.contributed_capital_cents),
      cutoverDate: openingRow.cutover_date,
      floatingInCents: Number(openingRow.floating_cents),
      fundedAccounts: Number(openingRow.funded_accounts),
      fundingPendingInCents: Number(openingRow.funding_pending_cents),
      id: openingRow.id,
      liveEvaluationAccounts: Number(openingRow.live_evaluation_accounts),
      mode: openingRow.start_mode as PeriodOpeningRecord["mode"],
      personalWithdrawalsInCents: Number(openingRow.personal_withdrawals_cents),
      inferredResultInCents: Number(openingRow.prior_realized_result_cents),
      virginAccounts: Number(openingRow.virgin_accounts),
      walletBalanceInCents: Number(openingRow.wallet_balance_cents),
      wallets: [],
    }) : undefined;
    const carriedResult = carryovers
      .filter((carryover) => carryover.to_period_id === periodId)
      .reduce((total, carryover) => total + Number(carryover.lifetime_result_cents), 0);
    const opening = carriedResult === 0 ? baseOpening : {
      ...(baseOpening ?? {
        accumulatedResultInCents: 0,
        brokerBalanceInCents: null,
        capitalNetInCents: 0,
        fundingPendingInCents: 0,
        walletBalanceInCents: 0,
      }),
      gainReconciliationBaselineInCents:
        (baseOpening?.gainReconciliationBaselineInCents ?? 0) - carriedResult,
    };
    result.set(periodId, {
      lastOperatedOn: operatingDates.at(-1) ?? null,
      summary: applyIndividualCommission(buildOperationalSummary({
        accounts: accountsForPeriod.map((account) => {
          const purchase = purchasesByAccount.get(account.id);
          return {
            fundsOrigin: purchase?.funds_origin === "Saldo generado" ? "Saldo generado" : "Aporte trader",
            id: account.id,
            priceInCents: Number(purchase?.price_cents ?? 0),
            purchaseBelongsToPeriod: purchase?.period_id === periodId,
            state: account.state,
            stateOrigin: account.state_origin,
          };
        }),
        controls: controlsForPeriod.map((control) => ({
          isUncovered: control.is_uncovered,
          balanceAfterInCents: Number(control.balance_after_cents),
          controlNumber: control.control_number,
          kind: control.kind,
          movementInCents: control.movement_cents === null ? null : Number(control.movement_cents),
          operatingResultInCents: control.operating_result_cents === null ? null : Number(control.operating_result_cents),
          originDestination: control.origin_destination,
          transferFeeInCents: Number(control.transfer_fee_cents ?? 0),
        })),
        entries: entriesForPeriod,
        fundingWithdrawals: fundingForPeriod,
        opening,
        phaseWithdrawals: phaseWithdrawalsForPeriod,
        walletMovements: walletForPeriod,
      }),agreements.get(periodId)??null),
    });
  }
  return result;
}
