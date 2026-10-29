export const ROOT_DESK = "00000000-0000-4000-8000-000000000001";
export const ECONOMIC_LABELS = {
  gross: "Ganancia bruta",
  total: "Ingreso total",
  commission: "Com. PA",
  historic: "Com. hist.",
} as const;
export type UserTerms = {
  user_id: string;
  effective_month: string;
  desk_id: string;
  level: number;
  state: string;
  commission_bps: number;
  bonus_enabled: boolean;
};
export type UserDistributionTerms = {
  user_id: string;
  effective_month: string;
  user_bps: number;
  nodal_bps: number;
  admin_pool_bps: number;
};
export type UserDistributionAdminShare = {
  user_id: string;
  effective_month: string;
  admin_user_id: string;
  share_bps: number;
};
export type DeskTerms = {
  desk_id: string;
  effective_month: string;
  manager_id: string | null;
  nodal_bps: number;
  active: boolean;
};
export type Desk = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};
export type Person = {
  id: string;
  name: string;
  email: string;
  access: string;
  master: boolean;
  gross: number;
  legacyCommission: number;
};

export function latestTerms<T extends { effective_month: string }>(
  terms: readonly T[],
  month: string,
  key: (item: T) => string,
): T[] {
  const selected = new Map<string, T>();
  for (const item of terms)
    if (
      item.effective_month <= month &&
      (!selected.has(key(item)) ||
        selected.get(key(item))!.effective_month < item.effective_month)
    )
      selected.set(key(item), item);
  return [...selected.values()];
}
export function portion(cents: number, bps: number) {
  if (
    !Number.isSafeInteger(cents) ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 10000
  )
    throw new Error("Invalid amount or percentage");
  return Math.round((cents * bps) / 10000);
}
export function suggestLevel(
  current: number,
  closedPeriods: readonly { month: string; gross: number }[],
) {
  const periods = [...closedPeriods].sort((a, b) =>
    b.month.localeCompare(a.month),
  );
  if (periods.length < 2) return null;
  const min = Math.min(periods[0].gross, periods[1].gross);
  const suggested = min > 3_000_000 ? 3 : min >= 1_000_000 ? 2 : 1;
  return suggested > current ? suggested : null;
}
export function calculateDeskOverview(
  desks: readonly Desk[],
  deskTerms: readonly DeskTerms[],
  users: readonly Person[],
  userTerms: readonly UserTerms[],
  month: string,
  distributionTerms: readonly UserDistributionTerms[] = [],
  distributionShares: readonly UserDistributionAdminShare[] = [],
) {
  const settings = new Map(
    latestTerms(userTerms, month, (t) => t.user_id).map((t) => [t.user_id, t]),
  );
  const agreements = new Map(
    latestTerms(deskTerms, month, (t) => t.desk_id).map((t) => [t.desk_id, t]),
  );
  const explicitDistributions = new Map(
    latestTerms(distributionTerms, month, (term) => term.user_id).map((term) => [term.user_id, term]),
  );
  const explicitShareMonths = new Map([...explicitDistributions].map(([userId, term]) => [userId, term.effective_month]));
  const deskById = new Map(desks.map((desk) => [desk.id, desk]));
  const legacyDistribution = (userId: string, deskId: string, commissionBps: number) => {
    let remaining = commissionBps;
    let currentDeskId: string | null = deskId;
    const shares: UserDistributionAdminShare[] = [];
    const visited = new Set<string>();
    while (currentDeskId && remaining > 0 && !visited.has(currentDeskId)) {
      visited.add(currentDeskId);
      const agreement = agreements.get(currentDeskId);
      if (!agreement?.active) break;
      const managerBps = agreement.manager_id
        ? Math.round((remaining * (10_000 - agreement.nodal_bps)) / 10_000)
        : 0;
      if (agreement.manager_id && managerBps > 0) shares.push({
        admin_user_id: agreement.manager_id,
        effective_month: month,
        share_bps: managerBps,
        user_id: userId,
      });
      remaining -= managerBps;
      currentDeskId = deskById.get(currentDeskId)?.parent_id ?? null;
    }
    return {
      shares,
      terms: {
        admin_pool_bps: shares.reduce((sum, share) => sum + share.share_bps, 0),
        effective_month: month,
        nodal_bps: remaining,
        user_bps: 10_000 - commissionBps,
        user_id: userId,
      } satisfies UserDistributionTerms,
    };
  };
  const resolvedShares = new Map<string, UserDistributionAdminShare[]>();
  const people = users.map((user) => {
    // Facturacion es ingreso realizado positivo. Una perdida cerrada se
    // conserva en la contabilidad del usuario, pero no puede reducir la
    // facturacion positiva generada por otra persona del sistema.
    const billableGross = Math.max(0, user.gross);
    const terms = settings.get(user.id);
    const explicit = explicitDistributions.get(user.id);
    const fallbackCommissionBps = terms?.commission_bps
      ?? (billableGross > 0 ? Math.round((user.legacyCommission * 10_000) / billableGross) : 0);
    const legacy = legacyDistribution(user.id, terms?.desk_id ?? ROOT_DESK, fallbackCommissionBps);
    const distribution = explicit ?? legacy.terms;
    const shares = explicit
      ? distributionShares.filter((share) => share.user_id === user.id
        && share.effective_month === explicitShareMonths.get(user.id))
      : legacy.shares;
    resolvedShares.set(user.id, shares);
    const commission = portion(Math.max(0, user.gross), 10_000 - distribution.user_bps);
    return {
      ...user,
      gross: billableGross,
      terms,
      deskId: terms?.desk_id ?? ROOT_DESK,
      distribution,
      adminShares: shares,
      commission,
      ownIncome: billableGross - commission,
      mesaIncome: 0,
      totalIncome: 0,
    };
  });
  const nodalByUser = new Map<string, number>();
  for (const source of people) {
    const gross = Math.max(0, source.gross);
    let distributed = source.ownIncome;
    for (const share of resolvedShares.get(source.id) ?? []) {
      const amount = portion(gross, share.share_bps);
      distributed += amount;
      const recipient = people.find((person) => person.id === share.admin_user_id);
      if (recipient) recipient.mesaIncome += amount;
    }
    nodalByUser.set(source.id, Math.max(0, gross - distributed));
  }
  const rows = desks
    .filter((d) => agreements.has(d.id))
    .map((d) => {
      const terms = agreements.get(d.id)!;
      const members = people.filter((p) => p.deskId === d.id);
      const generated = members.reduce((s, p) => s + p.commission, 0);
      return {
        ...d,
        terms,
        members: members.map((p) => p.id),
        gross: members.reduce((s, p) => s + p.gross, 0),
        directGenerated: generated,
        generated,
        nodalShare: 0,
        managerShare: 0,
        structureGross: members.reduce((s, p) => s + p.gross, 0),
        structureMembers: members.map((p) => p.id),
        children: desks
          .filter((c) => c.parent_id === d.id && agreements.get(c.id)?.active)
          .map((c) => c.id),
      };
    });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const resolved = new Set<string>();
  const resolving = new Set<string>();
  const resolveDesk = (deskId: string) => {
    const desk = rowsById.get(deskId);
    if (!desk || resolved.has(deskId)) return desk;
    if (resolving.has(deskId)) throw new Error("Invalid desk hierarchy");
    resolving.add(deskId);
    const childRows = desk.children.flatMap((childId) => {
      const child = resolveDesk(childId);
      return child ? [child] : [];
    });
    desk.generated = desk.directGenerated + childRows.reduce((sum, child) => sum + child.generated, 0);
    desk.structureGross = desk.gross + childRows.reduce((sum, child) => sum + child.structureGross, 0);
    desk.structureMembers = [
      ...desk.members,
      ...childRows.flatMap((child) => child.structureMembers),
    ];
    desk.nodalShare = desk.structureMembers.reduce((sum, userId) => sum + (nodalByUser.get(userId) ?? 0), 0);
    desk.managerShare = desk.terms.manager_id
      ? desk.structureMembers.reduce((sum, userId) => sum + (resolvedShares.get(userId) ?? [])
        .filter((share) => share.admin_user_id === desk.terms.manager_id)
        .reduce((shareSum, share) => shareSum + portion(Math.max(0, people.find((person) => person.id === userId)?.gross ?? 0), share.share_bps), 0), 0)
      : 0;
    resolving.delete(deskId);
    resolved.add(deskId);
    return desk;
  };
  for (const desk of rows) resolveDesk(desk.id);
  for (const person of people)
    person.totalIncome = person.ownIncome + person.mesaIncome;
  return {
    people,
    desks: rows,
    gross: people.reduce((s, p) => s + p.gross, 0),
    nodalIncome: [...nodalByUser.values()].reduce((sum, amount) => sum + amount, 0),
  };
}
