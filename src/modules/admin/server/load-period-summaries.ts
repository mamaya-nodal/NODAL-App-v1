import type {
  FundingWithdrawal,
  OperationalSummary,
  OperationalOpeningSnapshot,
  WalletMovement,
} from "@/modules/summary/domain/operational-summary";
import { buildOperationalSummary } from "@/modules/summary/domain/operational-summary";
import { applyIndividualCommission } from '@/modules/summary/domain/individual-commission';
import { readAll } from './read-all';
import { loadIndividualCommission } from '@/modules/summary/server/individual-commission';
import type { AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { operationalOpeningFromRecord, type PeriodOpeningRecord } from "@/modules/summary/domain/opening-snapshot";
import { applyPriorPeriodAdjustments } from "@/modules/accounting/domain/prior-period-adjustments";
import { openingFromClosure } from "@/modules/summary/domain/closure-opening";

type Supabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

export type LoadedPeriodSummary = Readonly<{
  opening?: OperationalOpeningSnapshot;
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

  const requestedIds = new Set(periodIds);
  const { data: requestedPeriods, error: requestedError } = await supabase.from("periods")
    .select("id,workspace_id,period_month").in("id", periodIds);
  if (requestedError) throw new Error("No se pudieron verificar los períodos solicitados.");
  const workspaceIds = [...new Set((requestedPeriods ?? []).map((period) => period.workspace_id))];
  if (workspaceIds.length === 0) return result;
  const { data: historyPeriods, error: ownersError } = await supabase.from("periods")
    .select("id,workspace_id,period_month,lifecycle_status,workspaces(owner_user_id)")
    .in("workspace_id", workspaceIds).order("period_month");
  if (ownersError) throw new Error("No se pudo verificar la continuidad de los períodos.");
  const periodOwners = (historyPeriods ?? []).filter((period) => (requestedPeriods ?? []).some((requested) =>
    requested.workspace_id === period.workspace_id && requested.period_month >= period.period_month));
  periodIds = periodOwners.map((period) => period.id);

  const [accountsResult, controlsResult, walletResult, fundingResult, openingResult, carryoversResult, closuresResult, rectificationsResult] = await Promise.all([
    readAll(supabase.from("accounts").select("id, period_id, state, state_origin").in("period_id", periodIds).order("id")),
    readAll(supabase.from("daily_controls").select("period_id, control_number, operated_on, kind, movement_cents, origin_destination, balance_after_cents, operating_result_cents, is_uncovered, transfer_fee_cents").in("period_id", periodIds).order("id")),
    readAll(supabase.from("wallet_movements").select("id, period_id, wallet_id, destination_wallet_id, daily_control_id, occurred_on, kind, amount_cents, fee_cents, observation").in("period_id", periodIds).order("id")),
    readAll(supabase.from("funding_withdrawals").select("id, period_id, collected_period_id, account_result_applied_period_id, receipt_timing_v2, account_id, phase, approved_on, amount_cents, collected_on, wallet_id, collection_fee_cents").eq("is_active", true).in("period_id", periodIds).order("id")),
    readAll(supabase.from("period_opening_snapshots").select("id,period_id,start_mode,cutover_date,broker_balance_cents,wallet_balance_cents,funding_pending_cents,contributed_capital_cents,personal_withdrawals_cents,prior_realized_result_cents,floating_cents,virgin_accounts,live_evaluation_accounts,funded_accounts,closed_accounts_reference").in("period_id", periodIds).order("id")),
    readAll(supabase.from("account_period_carryovers").select("from_period_id,to_period_id,account_id,account_state,lifetime_result_cents,purchase_price_cents").in("to_period_id", periodIds).order("id")),
    readAll(supabase.from("period_closure_versions").select("period_id,version,summary_data").in("period_id", periodIds).order("version", { ascending: false })),
    readAll(supabase.from("period_rectifications").select("adjustment_period_id,result_adjustment_cents,commission_adjustment_cents").in("adjustment_period_id", periodIds).order("created_at")),
  ]);

  const accounts = accountsResult.data ?? [];
  const controls = controlsResult.data ?? [];
  const walletMovements = walletResult.data ?? [];
  const fundingWithdrawals = fundingResult.data ?? [];
  const openings = openingResult.data ?? [];
  const carryovers = carryoversResult.data ?? [];
  const closures = closuresResult.data ?? [];
  const rectifications = rectificationsResult.data ?? [];
  const failed=[accountsResult,controlsResult,walletResult,fundingResult,openingResult,carryoversResult,closuresResult,rectificationsResult].find(r=>r.error);
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

  const openingByPeriod = new Map<string, OperationalOpeningSnapshot>();
  const emptyOpening: OperationalOpeningSnapshot = {
    accumulatedResultInCents: 0, brokerBalanceInCents: null, capitalNetInCents: 0,
    fundingPendingInCents: 0, walletBalanceInCents: 0, liveResultInCents: 0,
    virginPriceInCents: 0, verified: true, accumulatedBreakdownAvailable: true,
  };
  for (const [periodIndex, period] of periodOwners.entries()) {
    const periodId = period.id;
    const controlsForPeriod = controls.filter((control) => control.period_id === periodId);
    const operatingDates = controlsForPeriod
      .filter((control) => control.kind === "balance_update")
      .map((control) => control.operated_on)
      .sort();
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
        dailyControlId: movement.daily_control_id,
        destinationWalletId: movement.destination_wallet_id,
        id: movement.id,
        kind: movement.kind as WalletMovement["kind"],
        occurredOn: movement.occurred_on,
        observation: movement.observation,
        feeInCents: Number(movement.fee_cents ?? 0),
        walletId: movement.wallet_id,
      }));
    const fundingForPeriod: FundingWithdrawal[] = fundingWithdrawals
      .filter((withdrawal) => withdrawal.period_id === periodId
        || withdrawal.collected_period_id === periodId
        || withdrawal.account_result_applied_period_id === periodId)
      .map((withdrawal) => ({
        accountId: withdrawal.account_id,
        accountResultAppliedInPeriod: withdrawal.receipt_timing_v2
          ? withdrawal.account_result_applied_period_id === periodId
          : undefined,
        phase: withdrawal.phase as FundingWithdrawal["phase"],
        amountInCents: Number(withdrawal.amount_cents),
        approvalBelongsToPeriod: withdrawal.receipt_timing_v2 ? withdrawal.period_id === periodId : undefined,
        approvedOn: withdrawal.approved_on,
        collectionBelongsToPeriod: withdrawal.receipt_timing_v2
          ? withdrawal.collected_period_id === periodId
          : undefined,
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
    const previousPeriod = periodOwners.slice(0, periodIndex).reverse()
      .find((candidate) => candidate.workspace_id === period.workspace_id);
    const previous = previousPeriod ? result.get(previousPeriod.id)?.summary : undefined;
    const previousFees = previousPeriod ? controls.filter((row) => row.period_id === previousPeriod.id)
      .reduce((total, row) => total + Number(row.transfer_fee_cents ?? 0), 0)
      + walletMovements.filter((row) => row.period_id === previousPeriod.id)
        .reduce((total, row) => total + Number(row.fee_cents ?? 0), 0)
      + fundingWithdrawals.filter((row) => row.collected_period_id === previousPeriod.id && row.collected_on)
        .reduce((total, row) => total + Number(row.collection_fee_cents ?? 0), 0) : 0;
    const opening: OperationalOpeningSnapshot = baseOpening ? {
      ...baseOpening,
      // Migration totals are preserved, but cannot prove a per-account breakdown.
      liveResultInCents: -(baseOpening.floatingInCents ?? 0),
      verified: (baseOpening.accountStates?.live ?? 0) === 0 && (baseOpening.accountStates?.virgin ?? 0) === 0,
      accumulatedBreakdownAvailable: false,
    } : previous && previousPeriod ? {
      ...openingFromClosure(previous, carryovers
        .filter((row) => row.to_period_id === periodId && row.from_period_id === previousPeriod.id)
        .map((row) => ({
          accountState: row.account_state as "live" | "virgin",
          lifetimeResultInCents: Number(row.lifetime_result_cents),
          purchasePriceInCents: Number(row.purchase_price_cents),
        })), previousFees, openingByPeriod.get(previousPeriod.id) ?? emptyOpening),
      ...(!latestClosureByPeriod.has(previousPeriod.id) ? { verified: false } : {}),
    } : { ...emptyOpening };
    openingByPeriod.set(periodId, opening);
    const closedSummary = latestClosureByPeriod.get(periodId);
    if (closedSummary) {
      // Published history remains immutable; the new opening reads its evidence.
      result.set(periodId, { opening, lastOperatedOn: operatingDates.at(-1) ?? null, summary: closedSummary });
      continue;
    }
    const summary = applyPriorPeriodAdjustments(applyIndividualCommission(buildOperationalSummary({
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
      opening: {
        ...opening,
        verified: opening.verified !== false && accountsForPeriod.every((account) => purchasesByAccount.has(account.id)),
      },
      phaseWithdrawals: phaseWithdrawalsForPeriod,
      walletMovements: walletForPeriod,
    }),agreements.get(periodId)??null), rectifications
      .filter((rectification) => rectification.adjustment_period_id === periodId)
      .reduce((adjustments, rectification) => ({
        commissionInCents: adjustments.commissionInCents + Number(rectification.commission_adjustment_cents),
        resultInCents: adjustments.resultInCents + Number(rectification.result_adjustment_cents),
      }), { commissionInCents: 0, resultInCents: 0 }));
    result.set(periodId, {
      opening,
      lastOperatedOn: operatingDates.at(-1) ?? null,
      summary,
    });
  }
  return new Map([...result].filter(([id]) => requestedIds.has(id)));
}
