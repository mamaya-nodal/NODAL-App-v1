import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  accountProgressLabel,
  resolveCurrentAccountProgress,
  type AccountOperationalState,
  type AccountPhase,
} from "@/modules/operations/domain/account-progress";
import { transmittedWithinLast24Hours } from "../domain/connector-activity";
import { calculateDeskOverview } from "../domain/desks";
import { requireNodalAdmin } from "./admin-access";
import { loadDesks } from "./load-desks";

type UnitRow = Readonly<{
  agreement_bps: number;
  code: string;
  id: string;
  name: string;
  ordinal: number;
  responsible_email: string;
  responsible_name: string;
  root_desk_id: string;
  included_in_master_reporting: boolean;
}>;

export type MasterUnitSummary = Readonly<{
  deskCount: number;
  gross: number;
  id: string;
  nodalIncome: number;
  userCount: number;
}>;

export type MasterUserOperationalAccount = Readonly<{
  accountingState: string;
  company: string;
  externalName: string;
  id: string;
  lastOperatedOn: string | null;
  operatingFrom: string;
  operationalState: string;
  progress: string;
}>;

export type MasterUserReconciliationAlert = Readonly<{
  amount: number;
  id: string;
  occurredAt: string;
  reason: string;
}>;

export type MasterUserOperationalDetail = Readonly<{
  accounts: readonly MasterUserOperationalAccount[];
  alerts: readonly MasterUserReconciliationAlert[];
  lastOperatedOn: string | null;
  performance: readonly Readonly<{ amount: number; label: string }>[];
}>;

export async function loadMasterControl(
  requestedMonth?: string,
) {
  const [deskData, adminDb] = await Promise.all([
    loadDesks("real", requestedMonth, { officialMasterReporting: true }),
    requireNodalAdmin(),
  ]);
  const { data: claimsData } = await adminDb.auth.getClaims();
  const db = createServiceClient();
  const userIds = deskData.overview.people.map((person) => person.id);
  const [unitsResult, profilesResult, identifiersResult, workspacesResult, connectorsResult, openingRevisionRequestsResult] = await Promise.all([
    db.from("nodal_units").select("id,ordinal,name,code,root_desk_id,responsible_name,responsible_email,agreement_bps,included_in_master_reporting").order("ordinal"),
    db.from("nodal_users")
      .select("id,email,contact_email,display_name,access_state,access_role,created_at,identities_enabled,configuration_enabled")
      .in("id", userIds),
    db.from("nodal_user_identifiers")
      .select("user_id,desk_id,display_id,valid_from,valid_to,reason")
      .in("user_id", userIds).order("valid_from", { ascending: false }),
    db.from("workspaces")
      .select("id,owner_user_id,periods(id,period_month)")
      .eq("modality", "real").in("owner_user_id", userIds),
    db.from("ninja_connectors")
      .select("id,owner_user_id,identity_id,status,connector_version,last_seen_at,paired_at")
      .in("owner_user_id", userIds).order("paired_at", { ascending: false }),
    db.from("period_opening_revision_requests")
      .select("id,requested_by,requested_at")
      .eq("status", "pending").order("requested_at", { ascending: true }),
  ]);
  if (unitsResult.error || profilesResult.error || identifiersResult.error || workspacesResult.error || connectorsResult.error || openingRevisionRequestsResult.error) {
    throw new Error("No se pudo cargar el panel de control Admin Master.");
  }

  const workspaceRows = workspacesResult.data ?? [];
  const workspaceOwner = new Map(workspaceRows.map((workspace) => [workspace.id, workspace.owner_user_id]));
  const workspaceIds = workspaceRows.map((workspace) => workspace.id);
  const identitiesResult = workspaceIds.length > 0
    ? await db.from("nodal_identities")
      .select("id,workspace_id,first_name,last_name,onboarding_status")
      .in("workspace_id", workspaceIds).order("created_at")
    : { data: [], error: null };
  if (identitiesResult.error) throw new Error("No se pudieron cargar las identidades del sistema.");

  const identitiesByUser: Record<string, Array<{
    id: string;
    name: string;
    state: string;
  }>> = {};
  for (const identity of identitiesResult.data ?? []) {
    const ownerId = workspaceOwner.get(identity.workspace_id);
    if (!ownerId) continue;
    identitiesByUser[ownerId] = [
      ...(identitiesByUser[ownerId] ?? []),
      {
        id: identity.id,
        name: `${identity.first_name} ${identity.last_name}`.trim(),
        state: identity.onboarding_status,
      },
    ];
  }

  const connectorRows = connectorsResult.data ?? [];
  const connectorByUser: Record<string, {
    active: boolean;
    lastSeenAt: string | null;
    version: string | null;
  }> = {};
  for (const ownerId of userIds) {
    const ownerConnectors = connectorRows.filter((connector) => connector.owner_user_id === ownerId);
    if (!ownerConnectors.length) continue;
    const mostRecentSignal = ownerConnectors
      .filter((connector) => connector.last_seen_at)
      .sort((left, right) => right.last_seen_at!.localeCompare(left.last_seen_at!))[0] ?? ownerConnectors[0];
    connectorByUser[ownerId] = {
      active: ownerConnectors.some((connector) => connector.status === "active"
        && transmittedWithinLast24Hours(connector.last_seen_at)),
      lastSeenAt: mostRecentSignal.last_seen_at,
      version: mostRecentSignal.connector_version || null,
    };
  }

  const identifierHistoryByUser: Record<string, typeof identifiersResult.data> = {};
  for (const identifier of identifiersResult.data ?? []) {
    identifierHistoryByUser[identifier.user_id] = [
      ...(identifierHistoryByUser[identifier.user_id] ?? []),
      identifier,
    ];
  }

  const units = (unitsResult.data ?? []) as UnitRow[];
  const deskById = new Map(deskData.overview.desks.map((desk) => [desk.id, desk]));
  const unitByDesk: Record<string, string> = {};
  const resolveUnitId = (deskId: string) => {
    if (unitByDesk[deskId]) return unitByDesk[deskId];
    const visited = new Set<string>();
    let currentId: string | null = deskId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const unit = units.find((candidate) => candidate.root_desk_id === currentId);
      if (unit) {
        for (const id of visited) unitByDesk[id] = unit.id;
        return unit.id;
      }
      currentId = deskById.get(currentId)?.parent_id ?? null;
    }
    return units[0]?.id ?? "";
  };
  for (const desk of deskData.overview.desks) resolveUnitId(desk.id);
  const unitByUser = Object.fromEntries(deskData.overview.people.map((person) => [
    person.id,
    resolveUnitId(person.deskId),
  ]));
  const excludedUnitIds = new Set(units
    .filter((unit) => !unit.included_in_master_reporting)
    .map((unit) => unit.id));
  const excludedUserIds = new Set(deskData.overview.people
    .filter((person) => excludedUnitIds.has(unitByUser[person.id]))
    .map((person) => person.id));
  const rebuildReportingOverview = (snapshot: (typeof deskData.periodOverviews)[number]) => calculateDeskOverview(
    snapshot.overview.desks.map((desk) => ({
      created_at: desk.created_at,
      id: desk.id,
      name: desk.name,
      parent_id: desk.parent_id,
    })),
    snapshot.overview.desks.map((desk) => desk.terms),
    snapshot.overview.people.map((person) => ({
      access: person.access,
      email: person.email,
      gross: excludedUserIds.has(person.id) ? 0 : person.gross,
      id: person.id,
      legacyCommission: excludedUserIds.has(person.id) ? 0 : person.legacyCommission,
      master: person.master,
      name: person.name,
    })),
    snapshot.overview.people.flatMap((person) => person.terms ? [person.terms] : []),
    snapshot.month,
    deskData.distributionSettings,
    deskData.distributionAdminShares,
  );
  const reportingPeriodOverviews = deskData.periodOverviews.map((snapshot) => ({
    month: snapshot.month,
    overview: rebuildReportingOverview(snapshot),
  }));
  const overview = reportingPeriodOverviews.find((snapshot) => snapshot.month === deskData.month)?.overview
    ?? rebuildReportingOverview({ month: deskData.month, overview: deskData.overview });
  const historicalGrossByUser = Object.fromEntries(overview.people.map((person) => [
    person.id,
    reportingPeriodOverviews.reduce((sum, snapshot) => sum
      + (snapshot.overview.people.find((candidate) => candidate.id === person.id)?.gross ?? 0), 0),
  ]));
  const historicCommission = Object.fromEntries(overview.people.map((person) => [
    person.id,
    reportingPeriodOverviews.reduce((sum, snapshot) => sum
      + (snapshot.overview.people.find((candidate) => candidate.id === person.id)?.commission ?? 0), 0),
  ]));
  const unitSummaries: MasterUnitSummary[] = units.map((unit) => {
    const people = overview.people.filter((person) => unitByUser[person.id] === unit.id);
    const desks = overview.desks.filter((desk) => resolveUnitId(desk.id) === unit.id && desk.terms.active);
    const root = desks.find((desk) => desk.id === unit.root_desk_id);
    return {
      deskCount: desks.length,
      gross: people.reduce((sum, person) => sum + person.gross, 0),
      id: unit.id,
      nodalIncome: root?.nodalShare ?? 0,
      userCount: people.filter((person) => person.access === "active").length,
    };
  });

  const currentPeriodRows = workspaceRows.flatMap((workspace) => (workspace.periods ?? [])
    .filter((period) => period.period_month === deskData.month)
    .map((period) => ({ ...period, owner_user_id: workspace.owner_user_id })));
  const currentPeriodIds = currentPeriodRows.map((period) => period.id);
  const connectorIds = connectorRows.map((connector) => connector.id);
  const [accountsResult, batchesResult, companiesResult] = await Promise.all([
    currentPeriodIds.length
      ? db.from("accounts")
        .select("id,period_id,company_id,reference_number,state,state_origin")
        .in("period_id", currentPeriodIds)
      : Promise.resolve({ data: [], error: null }),
    connectorIds.length
      ? db.from("ninja_operation_batches")
        .select("id,connector_id,broker_result_cents,opened_at,operated_on,status,accounting_status,accounting_blocking_reason,accounting_period_id")
        .in("connector_id", connectorIds)
        .order("opened_at", { ascending: false })
        .limit(500)
      : Promise.resolve({ data: [], error: null }),
    db.from("companies").select("id,display_name"),
  ]);
  if (accountsResult.error || batchesResult.error || companiesResult.error) {
    throw new Error("No se pudo cargar la supervisión operativa del panel Admin Master.");
  }

  const accountRows = accountsResult.data ?? [];
  const accountIds = accountRows.map((account) => account.id);
  const [linksResult, assignmentsResult, entriesResult, payoutsResult] = await Promise.all([
    accountIds.length
      ? db.from("ninja_account_links")
        .select("account_id,connector_id,external_account_name,phase,closed_at,linked_at,accounting_phase,completed_trade_days")
        .in("account_id", accountIds).order("linked_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? db.from("identity_account_assignments")
        .select("account_id,identity_id,assigned_at,unassigned_at").in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? db.from("operation_entries")
        .select("account_id,daily_control_id,operated_on,phase").in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? db.from("funding_withdrawals")
        .select("account_id,phase,approved_on").eq("is_active", true).in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linksResult.error || assignmentsResult.error || entriesResult.error || payoutsResult.error) {
    throw new Error("No se pudo reconstruir el detalle operativo de los usuarios.");
  }

  const companyById = new Map((companiesResult.data ?? []).map((company) => [company.id, company.display_name]));
  const periodOwner = new Map(currentPeriodRows.map((period) => [period.id, period.owner_user_id]));
  const identityById = new Map((identitiesResult.data ?? []).map((identity) => [identity.id, {
    name: `${identity.first_name} ${identity.last_name}`.trim(),
    ownerId: workspaceOwner.get(identity.workspace_id),
  }]));
  const connectorById = new Map(connectorRows.map((connector) => [connector.id, connector]));
  const activeLinkByAccount = new Map<string, (typeof linksResult.data)[number]>();
  for (const link of linksResult.data ?? []) {
    if (!link.closed_at && !activeLinkByAccount.has(link.account_id)) activeLinkByAccount.set(link.account_id, link);
  }
  const activeAssignmentByAccount = new Map((assignmentsResult.data ?? [])
    .filter((assignment) => !assignment.unassigned_at)
    .map((assignment) => [assignment.account_id, assignment.identity_id] as const));
  const entriesByAccount = new Map<string, typeof entriesResult.data>();
  for (const entry of entriesResult.data ?? []) {
    entriesByAccount.set(entry.account_id, [...(entriesByAccount.get(entry.account_id) ?? []), entry]);
  }
  const payoutsByAccount = new Map<string, typeof payoutsResult.data>();
  for (const payout of payoutsResult.data ?? []) {
    payoutsByAccount.set(payout.account_id, [...(payoutsByAccount.get(payout.account_id) ?? []), payout]);
  }
  const accountsByOwner = new Map<string, typeof accountRows>();
  for (const account of accountRows) {
    const ownerId = periodOwner.get(account.period_id);
    if (ownerId) accountsByOwner.set(ownerId, [...(accountsByOwner.get(ownerId) ?? []), account]);
  }
  const batchesByOwner = new Map<string, typeof batchesResult.data>();
  for (const batch of batchesResult.data ?? []) {
    const ownerId = connectorById.get(batch.connector_id)?.owner_user_id;
    const belongsToCurrentPeriod = batch.accounting_period_id
      ? currentPeriodIds.includes(batch.accounting_period_id)
      : batch.opened_at.slice(0, 7) === deskData.month.slice(0, 7);
    if (ownerId && belongsToCurrentPeriod) {
      batchesByOwner.set(ownerId, [...(batchesByOwner.get(ownerId) ?? []), batch]);
    }
  }

  const operationalDetailByUser: Record<string, MasterUserOperationalDetail> = {};
  for (const person of overview.people) {
    const userAccounts = accountsByOwner.get(person.id) ?? [];
    const accounts = userAccounts.filter((account) => account.state !== "closed").map((account) => {
      const link = activeLinkByAccount.get(account.id);
      const accountEntries = entriesByAccount.get(account.id) ?? [];
      const accountPayouts = (payoutsByAccount.get(account.id) ?? []).flatMap((payout) =>
        payout.phase && payout.phase !== "Evaluacion"
          ? [{ phase: payout.phase as Exclude<AccountPhase, "Evaluacion"> }]
          : []);
      const operationalState = link?.phase === "Evaluation" || link?.phase === "Funded" || link?.phase === "Live"
        ? link.phase as AccountOperationalState
        : null;
      const progress = resolveCurrentAccountProgress({
        baseline: link?.accounting_phase && link.completed_trade_days !== null
          ? { completedTradeDays: Number(link.completed_trade_days), phase: link.accounting_phase as AccountPhase }
          : null,
        entries: accountEntries.map((entry) => ({
          dailyControlId: entry.daily_control_id,
          phase: entry.phase as AccountPhase,
        })),
        operationalState,
        payouts: accountPayouts,
      });
      const connectorIdentityId = link ? connectorById.get(link.connector_id)?.identity_id : null;
      const identityId = connectorIdentityId ?? activeAssignmentByAccount.get(account.id) ?? null;
      const identity = identityId ? identityById.get(identityId) : null;
      const lastOperatedOn = accountEntries.map((entry) => entry.operated_on).sort().at(-1) ?? null;
      return {
        accountingState: account.state,
        company: companyById.get(account.company_id) ?? "Empresa no identificada",
        externalName: link?.external_account_name ?? `Cuenta ${account.reference_number}`,
        id: account.id,
        lastOperatedOn,
        operatingFrom: identity?.ownerId === person.id ? identity.name : "Ninja personal",
        operationalState: operationalState ?? "Sin señal actual",
        progress: accountProgressLabel(progress),
      };
    }).sort((left, right) => (right.lastOperatedOn ?? "").localeCompare(left.lastOperatedOn ?? "")
      || left.externalName.localeCompare(right.externalName));
    const userBatches = batchesByOwner.get(person.id) ?? [];
    const alerts = userBatches.filter((batch) => batch.accounting_status !== "committed").map((batch) => ({
      amount: Number(batch.broker_result_cents),
      id: batch.id,
      occurredAt: batch.operated_on ?? batch.opened_at,
      reason: batch.accounting_blocking_reason
        || (batch.accounting_status === "shadow_ready" ? "Pendiente de confirmación contable" : "Requiere revisión de conciliación"),
    }));
    const lastOperatedOn = [
      ...accounts.flatMap((account) => account.lastOperatedOn ? [account.lastOperatedOn] : []),
      ...userBatches.map((batch) => batch.operated_on ?? batch.opened_at.slice(0, 10)),
    ].sort().at(-1) ?? null;
    operationalDetailByUser[person.id] = {
      accounts,
      alerts,
      lastOperatedOn,
      performance: reportingPeriodOverviews.map((snapshot) => ({
        amount: snapshot.overview.people.find((candidate) => candidate.id === person.id)?.gross ?? 0,
        label: snapshot.month.slice(0, 7),
      })),
    };
  }

  return {
    ...deskData,
    overview,
    historicCommission,
    historicalGrossByUser,
    operationalDetailByUser,
    performanceHistory: reportingPeriodOverviews
      .slice()
      .reverse()
      .map((snapshot) => ({
        gross: snapshot.overview.gross,
        month: snapshot.month,
        nodalIncome: snapshot.overview.nodalIncome,
      })),
    chart: reportingPeriodOverviews
      .slice(0, 12)
      .reverse()
      .map((snapshot) => ({
        month: snapshot.month,
        values: Object.fromEntries(snapshot.overview.desks.map((desk) => [desk.id, desk.gross])),
      })),
    actorUserId: claimsData?.claims.sub ?? null,
    demo: false,
    connectorByUser,
    identitiesByUser,
    identifiersByUser: Object.fromEntries((identifiersResult.data ?? [])
      .filter((identifier) => identifier.valid_to === null)
      .map((identifier) => [identifier.user_id, identifier.display_id])),
    identifierHistoryByUser,
    pendingOpeningRevisionRequests: (openingRevisionRequestsResult.data ?? []).map((request) => {
      const profile = (profilesResult.data ?? []).find((candidate) => candidate.id === request.requested_by);
      return {
        createdAt: request.requested_at,
        email: profile?.email ?? "",
        id: request.id,
        name: profile?.display_name || profile?.email || "Usuario NODAL",
      };
    }),
    profilesByUser: Object.fromEntries((profilesResult.data ?? []).map((profile) => [profile.id, profile])),
    unitByDesk,
    unitByUser,
    unitSummaries,
    excludedFromMasterReportingUserIds: [...excludedUserIds],
    reportingUnitCount: units.filter((unit) => unit.included_in_master_reporting).length,
    reportingUserCount: overview.people.filter((person) => person.access === "active"
      && !excludedUserIds.has(person.id)).length,
    units,
  };
}

export type MasterControlData = Awaited<ReturnType<typeof loadMasterControl>>;
