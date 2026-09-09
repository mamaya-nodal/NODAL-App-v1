"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  OPERATION_PHASES,
  accountsForCompany,
  chooseLeader,
  toggleReplica,
  type DailyControlAccount,
} from "@/modules/control-diario/domain/account-selection";
import {
  calculateDailyBalance,
  parseControlAmountToCents,
  type DailyBalanceEntry,
} from "@/modules/control-diario/domain/balance-rules";
import type { ControlOriginDestination } from "@/modules/control-diario/domain/control-catalogs";
import { TradeTelemetryProbe } from "./trade-telemetry-probe";
import {
  assertCanReceiveBrokerBalance,
  correctBrokerBalanceReview,
  createBrokerBalanceReview,
  effectiveBrokerBalance,
  type BrokerBalanceReview,
} from "@/modules/control-diario/domain/broker-sync-review";
import {
  allocateResultEqually,
  parseSignedAmountToCents,
  toBrokerEntry,
  validateCustomAllocation,
  type CustomAllocation,
  type EqualAllocation,
} from "@/modules/control-diario/domain/result-allocation";
import {
  recalculateAfterBalanceCorrection,
  type RecalculatedHistoricalControl,
} from "@/modules/control-diario/domain/historical-correction";

import {
  confirmDailyControl,
  correctDailyControlBalance,
} from "./daily-control-actions";

type EntryKind = DailyBalanceEntry["kind"];

type PreviewRow = {
  allocationReason: string | null;
  balanceInCents: number;
  controlId: string;
  id: number;
  kind: EntryKind;
  movementInCents: number | null;
  operatedOn?: string | null;
  operatingResultInCents: number | null;
  participants: Array<{
    accountId: string;
    accountReference: number;
    amountInCents: number;
    role: "leader" | "replica";
  }>;
  valueInCents: number;
};

export type PersistedDailyControl = PreviewRow;

export type NinjaBrokerBalanceEvent = Readonly<{
  balanceInCents: number;
  id: string;
  observedAt: string;
  sourceAccounts: ReadonlyArray<{
    accountName: string;
    balanceInCents: number;
    connectionName: string;
  }>;
}>;

function currentOperationalDay() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(new Date());
}

const entryLabels: Record<EntryKind, string> = {
  balance_update: "Nuevo saldo",
  deposit: "Depósito",
  withdrawal: "Retiro",
};

const syncIssueReasons = [
  "Saldo recibido incorrecto",
  "Actualización faltante",
  "Saldo duplicado",
  "Desconexión de NinjaTrader",
] as const;

type DailyControlPreviewProps = {
  accounts: DailyControlAccount[];
  brokerAccountNames?: readonly string[];
  companies: Array<{ id: string; name: string }>;
  embedded?: boolean;
  initialControls: PersistedDailyControl[];
  incomingNinjaBalance: NinjaBrokerBalanceEvent | null;
  ninjaBrokerSourceNotice: string | null;
  openingBalanceInCents?: number | null;
  periodId: string;
  propAccountNames?: readonly string[];
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

export function DailyControlPreview({
  accounts,
  brokerAccountNames = [],
  companies,
  embedded = false,
  initialControls,
  incomingNinjaBalance,
  ninjaBrokerSourceNotice,
  openingBalanceInCents = null,
  periodId,
  propAccountNames = [],
}: DailyControlPreviewProps) {
  const router = useRouter();
  const initialBalance = initialControls.at(-1)?.balanceInCents ?? openingBalanceInCents;
  const [balanceInCents, setBalanceInCents] = useState<number | null>(initialBalance);
  const [entryKind, setEntryKind] = useState<EntryKind>(
    initialBalance === null ? "deposit" : "balance_update",
  );
  const [originDestination, setOriginDestination] =
    useState<ControlOriginDestination>("Aporte trader");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>(initialControls);
  const [companyId, setCompanyId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [replicaIds, setReplicaIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<(typeof OPERATION_PHASES)[number]>(
    OPERATION_PHASES[0],
  );
  const initialNinjaReview =
    initialBalance !== null && incomingNinjaBalance
      ? createBrokerBalanceReview(initialBalance, incomingNinjaBalance.balanceInCents)
      : null;
  const [pendingBalance, setPendingBalance] =
    useState<BrokerBalanceReview | null>(initialNinjaReview);
  const [movementConfirmationKey, setMovementConfirmationKey] =
    useState<string | null>(null);
  const [pendingConfirmationKey, setPendingConfirmationKey] =
    useState<string | null>(incomingNinjaBalance?.id ?? null);
  const [reviewOpen, setReviewOpen] = useState(Boolean(initialNinjaReview));
  const [showContingency, setShowContingency] = useState(false);
  const [correctedAmount, setCorrectedAmount] = useState("");
  const [syncIssueReason, setSyncIssueReason] = useState<string>(
    syncIssueReasons[0],
  );
  const [correctionRow, setCorrectionRow] = useState<PreviewRow | null>(null);
  const [historicalCorrectedAmount, setHistoricalCorrectedAmount] = useState("");
  const [historicalCorrectionReason, setHistoricalCorrectionReason] = useState("");
  const [historicalCorrectionPreview, setHistoricalCorrectionPreview] =
    useState<RecalculatedHistoricalControl[] | null>(null);
  const [historicalAllocationValues, setHistoricalAllocationValues] = useState<
    Record<string, Record<string, string>>
  >({});
  const [customAllocationEnabled, setCustomAllocationEnabled] = useState(false);
  const [customAllocationValues, setCustomAllocationValues] = useState<
    Record<string, string>
  >({});
  const [customAllocationReason, setCustomAllocationReason] = useState("");

  const companyAccounts = accountsForCompany(accounts, companyId);
  const companyName =
    companies.find((company) => company.id === companyId)?.name ?? "Sin empresa";
  const accountReferences = new Map(
    companyAccounts.map((account) => [account.id, account.referenceNumber]),
  );
  const accountNames = new Map(
    companyAccounts.map((account) => [account.id, account.externalName ?? `Cuenta ${account.referenceNumber}`]),
  );
  let pendingAllocation: EqualAllocation[] = [];
  let allocationError: string | null = null;

  if (pendingBalance && leaderId) {
    try {
      pendingAllocation = allocateResultEqually(
        pendingBalance.operatingResultInCents,
        leaderId,
        replicaIds,
      );
    } catch (caughtError) {
      allocationError =
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo calcular la distribución.";
    }
  }

  let customAllocation: CustomAllocation[] = [];
  let customAllocationError: string | null = null;
  if (pendingBalance && leaderId && customAllocationEnabled) {
    customAllocation = [leaderId, ...replicaIds].map((accountId, index) => {
      let amountInCents = 0;
      try {
        amountInCents = parseSignedAmountToCents(
          customAllocationValues[accountId] ?? "",
        );
      } catch (caughtError) {
        customAllocationError =
          caughtError instanceof Error
            ? caughtError.message
            : "Revisá los importes por cuenta.";
      }
      return {
        accountId,
        amountInCents,
        role: index === 0 ? "leader" : "replica",
      };
    });
    if (!customAllocationError) {
      try {
        validateCustomAllocation(
          pendingBalance.operatingResultInCents,
          customAllocation,
        );
      } catch (caughtError) {
        customAllocationError =
          caughtError instanceof Error
            ? caughtError.message
            : "Revisá los importes por cuenta.";
      }
    }
  }
  const activeAllocation = customAllocationEnabled
    ? customAllocation
    : pendingAllocation;
  const activeAllocationError = customAllocationEnabled
    ? customAllocationError
    : allocationError;

  function resetCustomAllocation() {
    setCustomAllocationEnabled(false);
    setCustomAllocationValues({});
    setCustomAllocationReason("");
  }

  function enableCustomAllocation() {
    if (!pendingBalance || !leaderId) return;
    const equalAmounts = new Map(
      pendingAllocation.map((entry) => [entry.accountId, entry.amountInCents]),
    );
    setCustomAllocationValues(
      Object.fromEntries(
        [leaderId, ...replicaIds].map((accountId, index) => [
          accountId,
          ((equalAmounts.get(accountId) ??
            (index === 0 ? pendingBalance.operatingResultInCents : 0)) / 100).toFixed(2),
        ]),
      ),
    );
    setCustomAllocationReason("");
    setCustomAllocationEnabled(true);
  }

  function appendRow(
    controlId: string,
    id: number,
    kind: EntryKind,
    valueInCents: number,
    nextBalanceInCents: number,
    operatingResultInCents: number | null,
    participants: PreviewRow["participants"] = [],
    allocationReason: string | null = null,
  ) {
    setRows((currentRows) => [
      ...currentRows,
      {
        allocationReason,
        balanceInCents: nextBalanceInCents,
        controlId,
        id,
        kind,
        movementInCents: kind === "balance_update" ? null : valueInCents,
        operatedOn: currentOperationalDay(),
        operatingResultInCents,
        participants,
        valueInCents,
      },
    ]);
    setBalanceInCents(nextBalanceInCents);
  }

  async function addPreviewEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);

    try {
      assertCanReceiveBrokerBalance(pendingBalance);

      const valueInCents = parseControlAmountToCents(amount);
      const entry: DailyBalanceEntry =
        entryKind === "balance_update"
          ? { balanceInCents: valueInCents, kind: entryKind }
          : { amountInCents: valueInCents, kind: entryKind };
      calculateDailyBalance(balanceInCents, entry);

      if (entryKind === "balance_update") {
        if (!companyId || !leaderId) {
          throw new Error(
            "Prepará primero la empresa, la cuenta líder, las réplicas y la fase.",
          );
        }
        setPendingBalance(createBrokerBalanceReview(balanceInCents, valueInCents));
        resetCustomAllocation();
        setPendingConfirmationKey(crypto.randomUUID());
        setReviewOpen(true);
      } else {
        const confirmationKey = movementConfirmationKey ?? crypto.randomUUID();
        setMovementConfirmationKey(confirmationKey);
        setIsSaving(true);
        const result = await confirmDailyControl({
          amountInCents: valueInCents,
          balanceInCents: null,
          companyId: null,
          confirmationKey,
          kind: entryKind,
          leaderAccountId: null,
          originDestination,
          periodId,
          phase: null,
          receivedBalanceInCents: null,
          replicaAccountIds: [],
          syncIssueReason: null,
        });
        setIsSaving(false);

        if (!result.ok) throw new Error(result.message);
        appendRow(
          result.control.dailyControlId,
          result.control.controlNumber,
          entryKind,
          valueInCents,
          result.control.balanceAfterInCents,
          result.control.operatingResultInCents,
        );
        setMovementConfirmationKey(null);
        setEntryKind("balance_update");
        setSuccessMessage("Movimiento guardado correctamente.");
        if (incomingNinjaBalance && !pendingBalance) {
          setPendingBalance(
            createBrokerBalanceReview(
              result.control.balanceAfterInCents,
              incomingNinjaBalance.balanceInCents,
            ),
          );
          setPendingConfirmationKey(incomingNinjaBalance.id);
          setReviewOpen(true);
        }
        router.refresh();
      }

      setAmount("");
      setError(null);
    } catch (caughtError) {
      setIsSaving(false);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo calcular la vista previa.",
      );
    }
  }

  async function confirmPendingBalance() {
    if (
      !pendingBalance ||
      !pendingConfirmationKey ||
      activeAllocationError ||
      activeAllocation.length === 0 ||
      (customAllocationEnabled && !customAllocationReason.trim())
    ) return;

    const effectiveBalance = effectiveBrokerBalance(pendingBalance);
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await confirmDailyControl({
        amountInCents: null,
        balanceInCents: effectiveBalance,
        companyId,
        confirmationKey: pendingConfirmationKey,
        kind: "balance_update",
        leaderAccountId: leaderId,
        originDestination: null,
        periodId,
        phase,
        receivedBalanceInCents: pendingBalance.receivedBalanceInCents,
        replicaAccountIds: replicaIds,
        syncIssueReason: pendingBalance.correctionReason,
        ninjaBalanceEventId: incomingNinjaBalance?.id ?? null,
        customAllocation: customAllocationEnabled ? customAllocation : undefined,
        customAllocationReason: customAllocationEnabled
          ? customAllocationReason
          : null,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      appendRow(
        result.control.dailyControlId,
        result.control.controlNumber,
        "balance_update",
        effectiveBalance,
        result.control.balanceAfterInCents,
        result.control.operatingResultInCents,
        activeAllocation.map((entry) => ({
          accountId: entry.accountId,
          accountReference: accountReferences.get(entry.accountId) ?? 0,
          amountInCents: entry.amountInCents,
          role: entry.role,
        })),
        customAllocationEnabled ? customAllocationReason.trim() : null,
      );
      setPendingBalance(null);
      setPendingConfirmationKey(null);
      setReviewOpen(false);
      setShowContingency(false);
      setCorrectedAmount("");
      resetCustomAllocation();
      setEntryKind("balance_update");
      setSuccessMessage(
        `Control guardado y ${result.control.operationEntriesCreated} registros por cuenta creados.`,
      );
      router.refresh();
    } catch {
      setError(
        "No se pudo comunicar con el servidor. Podés volver a confirmar sin duplicar registros.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function applyContingency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingBalance) return;

    try {
      const correctedBalanceInCents = parseControlAmountToCents(correctedAmount);
      setPendingBalance(
        correctBrokerBalanceReview(
          pendingBalance,
          balanceInCents,
          correctedBalanceInCents,
          syncIssueReason,
        ),
      );
      resetCustomAllocation();
      setShowContingency(false);
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo aplicar la contingencia.",
      );
    }
  }

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLeaderId("");
    setReplicaIds([]);
    resetCustomAllocation();
  }

  function changeLeader(nextLeaderId: string) {
    if (!nextLeaderId) {
      setLeaderId("");
      setReplicaIds([]);
      resetCustomAllocation();
      return;
    }

    const selection = chooseLeader(nextLeaderId, replicaIds);
    setLeaderId(selection.leaderId);
    setReplicaIds(selection.replicaIds);
    resetCustomAllocation();
  }

  function changeReplica(accountId: string) {
    setReplicaIds(toggleReplica(leaderId, replicaIds, accountId));
    resetCustomAllocation();
  }

  function changeEntryKind(nextKind: EntryKind) {
    setEntryKind(nextKind);
    if (nextKind === "deposit") setOriginDestination("Aporte trader");
    if (nextKind === "withdrawal") setOriginDestination("Retiro personal");
  }

  function openHistoricalCorrection(row: PreviewRow) {
    setCorrectionRow(row);
    setHistoricalCorrectedAmount((row.balanceInCents / 100).toFixed(2));
    setHistoricalCorrectionReason("");
    setHistoricalCorrectionPreview(null);
    setHistoricalAllocationValues({});
    setError(null);
    setSuccessMessage(null);
  }

  function prepareHistoricalCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correctionRow) return;

    try {
      const correctedBalanceInCents = parseControlAmountToCents(
        historicalCorrectedAmount,
      );
      const preview = recalculateAfterBalanceCorrection(
        rows.map((row) => ({
          balanceAfterInCents: row.balanceInCents,
          hasCustomAllocation: Boolean(row.allocationReason),
          id: row.controlId,
          kind: row.kind,
          movementInCents: row.movementInCents,
          participantCount: row.participants.length,
        })),
        correctionRow.controlId,
        correctedBalanceInCents,
      );
      const targetIndex = rows.findIndex(
        (row) => row.controlId === correctionRow.controlId,
      );
      const values: Record<string, Record<string, string>> = {};
      rows.forEach((row, index) => {
        if (index < targetIndex || !row.allocationReason) return;
        const recalculated = preview[index];
        const resultDifference =
          (recalculated.operatingResultInCents ?? 0) -
          (row.operatingResultInCents ?? 0);
        values[row.controlId] = Object.fromEntries(
          row.participants.map((participant) => [
            participant.accountId,
            ((participant.amountInCents +
              (participant.role === "leader" ? resultDifference : 0)) /
              100).toFixed(2),
          ]),
        );
      });
      setHistoricalCorrectionPreview(preview);
      setHistoricalAllocationValues(values);
      setError(null);
    } catch (caughtError) {
      setHistoricalCorrectionPreview(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo preparar la corrección.",
      );
    }
  }

  async function confirmHistoricalCorrection() {
    if (!correctionRow || !historicalCorrectionPreview) return;

    try {
      const correctedBalanceInCents = parseControlAmountToCents(
        historicalCorrectedAmount,
      );
      const targetIndex = rows.findIndex(
        (row) => row.controlId === correctionRow.controlId,
      );
      const customRedistributions = rows.flatMap((row, index) => {
        if (index < targetIndex || !row.allocationReason) return [];
        const previewControl = historicalCorrectionPreview[index];
        const allocations = row.participants.map((participant) => ({
          accountId: participant.accountId,
          amountInCents: parseSignedAmountToCents(
            historicalAllocationValues[row.controlId]?.[participant.accountId] ?? "",
          ),
          role: participant.role,
        }));
        validateCustomAllocation(
          previewControl.operatingResultInCents ?? 0,
          allocations,
        );
        return [{ controlId: row.controlId, allocations }];
      });
      setIsSaving(true);
      setError(null);
      const result = await correctDailyControlBalance({
        correctedBalanceInCents,
        customRedistributions,
        dailyControlId: correctionRow.controlId,
        periodId,
        reason: historicalCorrectionReason,
      });
      if (!result.ok) throw new Error(result.message);

      const correctedById = new Map(
        result.controls.map((control) => [control.controlId, control]),
      );
      const redistributionById = new Map(
        customRedistributions.map((redistribution) => [
          redistribution.controlId,
          new Map(
            redistribution.allocations.map((allocation) => [
              allocation.accountId,
              allocation.amountInCents,
            ]),
          ),
        ]),
      );
      const nextRows = rows.map((row) => {
        const corrected = correctedById.get(row.controlId);
        if (!corrected) return row;
        const redistributed = redistributionById.get(row.controlId);
        return {
          ...row,
          balanceInCents: corrected.balanceInCents,
          operatingResultInCents: corrected.operatingResultInCents,
          participants: redistributed
            ? row.participants.map((participant) => ({
                ...participant,
                amountInCents:
                  redistributed.get(participant.accountId) ??
                  participant.amountInCents,
              }))
            : row.participants.map((participant) => ({
                ...participant,
                amountInCents:
                  corrected.operatingResultInCents === null
                    ? participant.amountInCents
                    : corrected.operatingResultInCents /
                      row.participants.length,
              })),
          valueInCents:
            row.kind === "balance_update"
              ? corrected.balanceInCents
              : row.valueInCents,
        };
      });
      setRows(nextRows);
      setBalanceInCents(nextRows.at(-1)?.balanceInCents ?? null);
      setCorrectionRow(null);
      setHistoricalCorrectedAmount("");
      setHistoricalCorrectionReason("");
      setHistoricalCorrectionPreview(null);
      setHistoricalAllocationValues({});
      setSuccessMessage(
        `Saldo corregido. Se recalcularon ${result.affectedControls} controles y ${result.affectedOperationEntries} registros por cuenta.`,
      );
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo corregir el saldo.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  let historicalRedistributionError: string | null = null;
  if (correctionRow && historicalCorrectionPreview) {
    const targetIndex = rows.findIndex(
      (row) => row.controlId === correctionRow.controlId,
    );
    try {
      rows.forEach((row, index) => {
        if (index < targetIndex || !row.allocationReason) return;
        const allocations = row.participants.map((participant) => ({
          accountId: participant.accountId,
          amountInCents: parseSignedAmountToCents(
            historicalAllocationValues[row.controlId]?.[participant.accountId] ?? "",
          ),
          role: participant.role,
        }));
        validateCustomAllocation(
          historicalCorrectionPreview[index].operatingResultInCents ?? 0,
          allocations,
        );
      });
    } catch (caughtError) {
      historicalRedistributionError =
        caughtError instanceof Error
          ? caughtError.message
          : "Revisá la redistribución excepcional.";
    }
  }

  return (
    <section
      className="daily-preview-panel"
      id="control-diario"
      aria-label={embedded ? "Control de operaciones" : undefined}
      aria-labelledby={embedded ? undefined : "daily-preview-title"}
    >
      {!embedded && (
        <div className="daily-preview-heading">
          <h2 id="daily-preview-title">Control diario</h2>
        </div>
      )}

      <TradeTelemetryProbe
        brokerAccountNames={brokerAccountNames}
        propAccountNames={propAccountNames}
        todayOperationCount={rows.filter((row) => row.kind === "balance_update" && row.operatedOn === currentOperationalDay()).length}
        todayResultInCents={rows
          .filter((row) => row.kind === "balance_update" && row.operatedOn === currentOperationalDay())
          .reduce((total, row) => total + (row.operatingResultInCents ?? 0), 0)}
      />

      <details
        className={`operation-context-preview${pendingBalance ? " pending" : ""}`}
        open={pendingBalance ? true : undefined}
      >
        <summary className="operation-context-heading">
          <strong>Asignación de cuentas</strong>
          {companyId && leaderId && (
            <span className="active-context-badge">Preparada</span>
          )}
        </summary>

        <div className="operation-context-fields">
          <div className="form-field">
            <label htmlFor="preview_company">Empresa</label>
            <select
              id="preview_company"
              onChange={(event) => changeCompany(event.target.value)}
              value={companyId}
            >
              <option value="">Elegí una empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="preview_leader">Cuenta líder</label>
            <select
              disabled={companyAccounts.length === 0}
              id="preview_leader"
              onChange={(event) => changeLeader(event.target.value)}
              value={leaderId}
            >
              <option value="">
                {companyId && companyAccounts.length === 0
                  ? "No hay cuentas compradas"
                  : "Elegí la cuenta líder"}
              </option>
              {companyAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.externalName ?? `Cuenta ${account.referenceNumber}`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="preview_phase">Fase</label>
            <select
              id="preview_phase"
              onChange={(event) =>
                setPhase(event.target.value as (typeof OPERATION_PHASES)[number])
              }
              value={phase}
            >
              {OPERATION_PHASES.map((operationPhase) => (
                <option key={operationPhase} value={operationPhase}>
                  {operationPhase}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="replica-section">
          <div className="replica-heading">
            <strong>Cuentas replicadas</strong>
            <span>{replicaIds.length} seleccionadas</span>
          </div>

          {!companyId ? (
            <p className="empty-state">Elegí una empresa para cargar su propia grilla.</p>
          ) : companyAccounts.length === 0 ? (
            <p className="empty-state">
              Esta empresa todavía no tiene cuentas compradas en el período.
            </p>
          ) : !leaderId ? (
            <p className="empty-state">
              Elegí primero la cuenta líder. No aparecerá entre las réplicas.
            </p>
          ) : (
            <div className="replica-grid" aria-label="Seleccionar cuentas replicadas">
              {companyAccounts
                .filter((account) => account.id !== leaderId)
                .map((account) => {
                  const selected = replicaIds.includes(account.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`replica-account${selected ? " selected" : ""}`}
                      key={account.id}
                      onClick={() => changeReplica(account.id)}
                      type="button"
                    >
                      {account.externalName ?? account.referenceNumber}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {pendingBalance && !reviewOpen && (
          <div className="pending-sync-alert" role="alert">
            <div>
              <strong>Hay un saldo de NinjaTrader sin resolver.</strong>
              <span>No se aceptará otro saldo hasta revisarlo.</span>
            </div>
            <button className="primary-action" onClick={() => setReviewOpen(true)} type="button">
              Revisar ahora
            </button>
          </div>
        )}

        {ninjaBrokerSourceNotice && (
          <div className="ninja-source-notice" role="status">
            <span aria-hidden="true" className="ninja-source-notice-icon">!</span>
            <div>
              <strong>Conector activo · sin cuenta broker</strong>
              <span>{ninjaBrokerSourceNotice}</span>
            </div>
          </div>
        )}
      </details>

      <div className="balance-summary" aria-live="polite">
        <span>Saldo broker</span>
        <strong>
          {balanceInCents === null ? "Sin saldo registrado" : formatMoney(balanceInCents)}
        </strong>
      </div>

      <details className="accounting-exception daily-movement-exception">
        <summary>Ajuste manual de saldo</summary>
        <form
          className={`daily-preview-form${entryKind === "balance_update" ? "" : " with-origin"}`}
          onSubmit={addPreviewEntry}
        >
        <div className="form-field">
          <label htmlFor="preview_entry_kind">Acción</label>
          <select
            disabled={Boolean(pendingBalance) || isSaving}
            id="preview_entry_kind"
            onChange={(event) => changeEntryKind(event.target.value as EntryKind)}
            value={entryKind}
          >
            <option value="deposit">
              {balanceInCents === null ? "Depósito inicial" : "Depósito"}
            </option>
            <option disabled={balanceInCents === null} value="withdrawal">
              Retiro
            </option>
            {process.env.NODE_ENV === "development" && (
              <option disabled={balanceInCents === null} value="balance_update">
                Simular saldo de NinjaTrader
              </option>
            )}
          </select>
        </div>

        {entryKind !== "balance_update" && (
          <div className="form-field">
            <label htmlFor="preview_origin_destination">Origen / destino</label>
            <select
              disabled={Boolean(pendingBalance) || isSaving}
              id="preview_origin_destination"
              onChange={(event) =>
                setOriginDestination(event.target.value as ControlOriginDestination)
              }
              value={originDestination}
            >
              {entryKind === "deposit" ? (
                <>
                  <option value="Aporte trader">Aporte trader</option>
                  <option value="Saldo billetera">Saldo billetera</option>
                </>
              ) : (
                <>
                  <option value="Retiro personal">Retiro personal</option>
                  <option value="Saldo billetera">Saldo billetera</option>
                </>
              )}
            </select>
          </div>
        )}

        <div className="form-field">
          <label htmlFor="preview_amount">
            {entryKind === "balance_update" ? "Saldo recibido (USD)" : "Importe (USD)"}
          </label>
          <input
            disabled={Boolean(pendingBalance) || isSaving}
            id="preview_amount"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder={balanceInCents === null ? "Ejemplo: 5000" : "Ejemplo: 5500"}
            required
            type="text"
            value={amount}
          />
        </div>

        <button
          className="primary-action"
          disabled={Boolean(pendingBalance) || isSaving}
          type="submit"
        >
          {isSaving
            ? "Guardando…"
            : entryKind === "balance_update"
              ? "Revisar saldo recibido"
              : "Guardar movimiento"}
        </button>
        </form>
      </details>

      {error && (
        <p className="purchase-message error" role="alert">
          {error}
        </p>
      )}

      {successMessage && (
        <p className="purchase-message success" role="status">
          {successMessage}
        </p>
      )}

      <div className="preview-history" aria-label="Historial de operaciones">
        {rows.length === 0 ? (
          <p className="empty-state">
            Las operaciones aparecerán aquí cuando NinjaTrader confirme su cierre.
          </p>
        ) : (
          rows.map((row) => (
            <article className="preview-row" key={row.id}>
              <div>
                <p className="purchase-reference">
                  {entryLabels[row.kind]} · {formatMoney(row.valueInCents)}
                </p>
                <p className="purchase-meta">
                  Saldo posterior: {formatMoney(row.balanceInCents)}
                </p>
              </div>
              <div className="preview-result">
                <span>Resultado</span>
                <strong>
                  {row.operatingResultInCents === null
                    ? "No corresponde"
                    : formatMoney(row.operatingResultInCents)}
                </strong>
                {row.kind === "balance_update" && (
                  <button
                    className="history-edit-action"
                    disabled={isSaving}
                    onClick={() => openHistoricalCorrection(row)}
                    type="button"
                  >
                    Corregir saldo
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {correctionRow && (
        <div className="sync-dialog-backdrop">
          <section
            aria-labelledby="historical-correction-title"
            aria-modal="true"
            className="sync-dialog historical-correction-dialog"
            role="dialog"
          >
            <p className="status">CORRECCIÓN DE SALDO</p>
            <h3 id="historical-correction-title">
              Corregir saldo registrado
            </h3>
            <p className="context-note">
              El saldo anterior se reemplazará en la vista. NODAL recalculará
              automáticamente los controles posteriores y todos sus registros por cuenta.
            </p>

            <div className="historical-current-value">
              <span>Saldo guardado actualmente</span>
              <strong>{formatMoney(correctionRow.balanceInCents)}</strong>
            </div>

            <form className="historical-correction-form" onSubmit={prepareHistoricalCorrection}>
              <div className="form-field">
                <label htmlFor="historical_corrected_balance">Saldo correcto (USD)</label>
                <input
                  disabled={isSaving || Boolean(historicalCorrectionPreview)}
                  id="historical_corrected_balance"
                  inputMode="decimal"
                  onChange={(event) => setHistoricalCorrectedAmount(event.target.value)}
                  required
                  type="text"
                  value={historicalCorrectedAmount}
                />
              </div>
              <div className="form-field">
                <label htmlFor="historical_correction_reason">Motivo de la corrección</label>
                <textarea
                  disabled={isSaving || Boolean(historicalCorrectionPreview)}
                  id="historical_correction_reason"
                  minLength={3}
                  onChange={(event) => setHistoricalCorrectionReason(event.target.value)}
                  placeholder="Ejemplo: saldo anotado incorrectamente"
                  required
                  value={historicalCorrectionReason}
                />
              </div>
              {!historicalCorrectionPreview && (
                <button className="primary-action" disabled={isSaving} type="submit">
                  Revisar corrección y distribuciones
                </button>
              )}

              {historicalCorrectionPreview && (
                <div className="historical-redistribution-list">
                  {rows.map((row, index) => {
                    const targetIndex = rows.findIndex(
                      (candidate) => candidate.controlId === correctionRow.controlId,
                    );
                    if (index < targetIndex || !row.allocationReason) return null;
                    const recalculated = historicalCorrectionPreview[index];
                    return (
                      <section className="historical-redistribution" key={row.controlId}>
                        <div className="custom-allocation-total">
                          <div>
                            <strong>Registro {row.id} · reparto excepcional</strong>
                            <span>{row.allocationReason}</span>
                          </div>
                          <div>
                            <span>Nuevo resultado total</span>
                            <strong>
                              {formatMoney(recalculated.operatingResultInCents ?? 0)}
                            </strong>
                          </div>
                        </div>
                        {row.participants.map((participant) => (
                          <label
                            className="historical-allocation-row"
                            key={participant.accountId}
                          >
                            <span>
                              {accounts.find((account) => account.id === participant.accountId)?.externalName ?? `Cuenta ${participant.accountReference}`} ·{" "}
                              {participant.role === "leader" ? "Líder" : "Réplica"}
                            </span>
                            <span className="custom-allocation-amount">
                              USD
                              <input
                                inputMode="decimal"
                                onChange={(event) =>
                                  setHistoricalAllocationValues((current) => ({
                                    ...current,
                                    [row.controlId]: {
                                      ...current[row.controlId],
                                      [participant.accountId]: event.target.value,
                                    },
                                  }))
                                }
                                type="text"
                                value={
                                  historicalAllocationValues[row.controlId]?.[
                                    participant.accountId
                                  ] ?? ""
                                }
                              />
                            </span>
                          </label>
                        ))}
                      </section>
                    );
                  })}
                  {historicalRedistributionError && (
                    <p className="purchase-message error" role="alert">
                      {historicalRedistributionError}
                    </p>
                  )}
                </div>
              )}
              <p className="correction-integrity-note">
                NODAL propone trasladar cualquier diferencia a la cuenta líder. Podés
                ajustar los importes, pero la suma debe coincidir exactamente con cada
                resultado total o no se modificará ningún dato.
              </p>
              <div className="dialog-actions">
                {historicalCorrectionPreview && (
                  <button
                    className="primary-action"
                    disabled={isSaving || Boolean(historicalRedistributionError)}
                    onClick={confirmHistoricalCorrection}
                    type="button"
                  >
                    {isSaving ? "Recalculando…" : "Confirmar corrección completa"}
                  </button>
                )}
                {historicalCorrectionPreview && (
                  <button
                    className="secondary-action"
                    disabled={isSaving}
                    onClick={() => {
                      setHistoricalCorrectionPreview(null);
                      setHistoricalAllocationValues({});
                    }}
                    type="button"
                  >
                    Cambiar saldo o motivo
                  </button>
                )}
                <button
                  className="text-action"
                  disabled={isSaving}
                  onClick={() => {
                    setCorrectionRow(null);
                    setHistoricalCorrectionPreview(null);
                    setHistoricalAllocationValues({});
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pendingBalance && reviewOpen && (
        <div className="sync-dialog-backdrop">
          <section
            aria-labelledby="sync-dialog-title"
            aria-modal="true"
            className="sync-dialog"
            role="dialog"
          >
            <p className="status">
              {incomingNinjaBalance
                ? "NUEVO SALDO RECIBIDO DE NINJATRADER"
                : "NUEVO SALDO SIMULADO DE NINJATRADER"}
            </p>
            <h3 id="sync-dialog-title">Revisá dónde se registrará</h3>

            <div className="sync-balance-comparison">
              <div>
                <span>Saldo anterior confirmado</span>
                <strong>{formatMoney(balanceInCents ?? 0)}</strong>
              </div>
              <div>
                <span>Saldo recibido</span>
                <strong>{formatMoney(pendingBalance.receivedBalanceInCents)}</strong>
              </div>
              {pendingBalance.correctedBalanceInCents !== null && (
                <div className="corrected-balance">
                  <span>Saldo corregido por contingencia</span>
                  <strong>{formatMoney(pendingBalance.correctedBalanceInCents)}</strong>
                </div>
              )}
              <div className="operating-result-card">
                <span>Resultado calculado por NODAL</span>
                <strong>{formatMoney(pendingBalance.operatingResultInCents)}</strong>
              </div>
            </div>

            {incomingNinjaBalance && (
              <div className="sync-source-list">
                <span>Origen detectado</span>
                <strong>
                  {incomingNinjaBalance.sourceAccounts
                    .map((account) => `${account.connectionName} · ${account.accountName}`)
                    .join(" + ")}
                </strong>
                <small>
                  Recibido {new Intl.DateTimeFormat("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(incomingNinjaBalance.observedAt))}
                </small>
              </div>
            )}

            <div className="sync-destination">
              <span>Se propone registrar en</span>
              <strong>
                {companyName} · Líder {accountNames.get(leaderId) ?? "—"} ·{" "}
                {replicaIds.length === 0
                  ? "sin réplicas"
                  : `réplicas ${replicaIds
                      .map((id) => accountNames.get(id))
                      .join(", ")}`} · {phase}
              </strong>
            </div>

            {activeAllocationError ? (
              <p className="purchase-message error" role="alert">
                {activeAllocationError} La confirmación permanece bloqueada.
              </p>
            ) : null}

            {activeAllocation.length > 0 && (
              <div className="allocation-list">
                {activeAllocation.map((entry) => {
                  const brokerEntry = toBrokerEntry(entry.amountInCents);
                  const destination =
                    brokerEntry.destination === "NETO_BROKER_POSITIVE"
                      ? "NETO BROKER +"
                      : brokerEntry.destination === "NETO_BROKER_NEGATIVE"
                        ? "NETO BROKER -"
                        : "Sin resultado broker";

                  return (
                    <article className="allocation-row" key={entry.accountId}>
                      <div>
                        <strong>{accountNames.get(entry.accountId) ?? "Cuenta —"}</strong>
                        <span>{entry.role === "leader" ? "Líder" : "Réplica"}</span>
                      </div>
                      <div>
                        <span>{destination}</span>
                        {customAllocationEnabled ? (
                          <label className="custom-allocation-amount">
                            <span className="sr-only">
                              Resultado de {accountNames.get(entry.accountId) ?? "cuenta"}
                            </span>
                            <span>USD</span>
                            <input
                              inputMode="decimal"
                              onChange={(event) =>
                                setCustomAllocationValues((current) => ({
                                  ...current,
                                  [entry.accountId]: event.target.value,
                                }))
                              }
                              type="text"
                              value={customAllocationValues[entry.accountId] ?? ""}
                            />
                          </label>
                        ) : (
                          <strong>{formatMoney(entry.amountInCents)}</strong>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {customAllocationEnabled ? (
              <div className="custom-allocation-panel">
                <div className="custom-allocation-total">
                  <span>Suma distribuida</span>
                  <strong>
                    {formatMoney(
                      customAllocation.reduce(
                        (total, entry) => total + entry.amountInCents,
                        0,
                      ),
                    )} de {formatMoney(pendingBalance.operatingResultInCents)}
                  </strong>
                </div>
                <div className="form-field">
                  <label htmlFor="custom_allocation_reason">
                    Motivo del ajuste excepcional
                  </label>
                  <input
                    id="custom_allocation_reason"
                    onChange={(event) => setCustomAllocationReason(event.target.value)}
                    placeholder="Ejemplo: una cuenta no replicó una operación"
                    required
                    type="text"
                    value={customAllocationReason}
                  />
                </div>
                <button
                  className="text-action"
                  onClick={resetCustomAllocation}
                  type="button"
                >
                  Volver a la distribución automática
                </button>
              </div>
            ) : (
              <button
                className="text-action allocation-adjust-action"
                onClick={enableCustomAllocation}
                type="button"
              >
                Ajustar importes por cuenta
              </button>
            )}

            {pendingBalance.correctionReason && (
              <p className="contingency-audit-note">
                Contingencia aplicada: {pendingBalance.correctionReason}. El dato
                original quedará reservado para auditoría.
              </p>
            )}

            {showContingency ? (
              <form className="contingency-form" onSubmit={applyContingency}>
                <div className="form-field">
                  <label htmlFor="sync_issue_reason">Problema detectado</label>
                  <select
                    id="sync_issue_reason"
                    onChange={(event) => setSyncIssueReason(event.target.value)}
                    value={syncIssueReason}
                  >
                    {syncIssueReasons.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="corrected_balance">Saldo correcto (USD)</label>
                  <input
                    id="corrected_balance"
                    inputMode="decimal"
                    onChange={(event) => setCorrectedAmount(event.target.value)}
                    required
                    type="text"
                    value={correctedAmount}
                  />
                </div>
                <div className="dialog-actions">
                  <button className="primary-action" type="submit">Recalcular</button>
                  <button
                    className="text-action"
                    onClick={() => setShowContingency(false)}
                    type="button"
                  >
                    Volver
                  </button>
                </div>
              </form>
            ) : (
              <div className="dialog-actions">
                <button
                  className="primary-action"
                  disabled={
                    isSaving ||
                    Boolean(activeAllocationError) ||
                    activeAllocation.length === 0 ||
                    (customAllocationEnabled && !customAllocationReason.trim())
                  }
                  onClick={confirmPendingBalance}
                  type="button"
                >
                  {isSaving ? "Guardando…" : "Confirmar y crear registros"}
                </button>
                <button
                  className="secondary-action"
                  onClick={() => setReviewOpen(false)}
                  type="button"
                >
                  Cambiar cuentas o fase
                </button>
                <button
                  className="text-action danger-text"
                  onClick={() => setShowContingency(true)}
                  type="button"
                >
                  Informar error de sincronización
                </button>
              </div>
            )}

            <p className="dialog-footnote">
              {incomingNinjaBalance
                ? "Este dato llegó desde el conector. Nada se registra hasta que confirmes el destino y la distribución."
                : "Este saldo se identifica expresamente como simulación de desarrollo y su confirmación sí se guarda."}
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
