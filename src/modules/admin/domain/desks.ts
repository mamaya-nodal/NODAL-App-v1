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
) {
  const settings = new Map(
    latestTerms(userTerms, month, (t) => t.user_id).map((t) => [t.user_id, t]),
  );
  const agreements = new Map(
    latestTerms(deskTerms, month, (t) => t.desk_id).map((t) => [t.desk_id, t]),
  );
  const people = users.map((user) => {
    const terms = settings.get(user.id);
    const commission = terms
      ? portion(Math.max(0, user.gross), terms.commission_bps)
      : user.legacyCommission;
    return {
      ...user,
      terms,
      deskId: terms?.desk_id ?? ROOT_DESK,
      commission,
      ownIncome: Math.max(0, user.gross) - commission,
      mesaIncome: 0,
      totalIncome: 0,
    };
  });
  const rows = desks
    .filter((d) => agreements.has(d.id))
    .map((d) => {
      const terms = agreements.get(d.id)!;
      const members = people.filter((p) => p.deskId === d.id);
      const generated = members.reduce((s, p) => s + p.commission, 0);
      const nodalShare = portion(generated, terms.nodal_bps);
      return {
        ...d,
        terms,
        members: members.map((p) => p.id),
        gross: members.reduce((s, p) => s + p.gross, 0),
        generated,
        nodalShare,
        managerShare: generated - nodalShare,
        children: desks
          .filter((c) => c.parent_id === d.id && agreements.get(c.id)?.active)
          .map((c) => c.id),
      };
    });
  for (const desk of rows) {
    const manager = people.find((p) => p.id === desk.terms.manager_id);
    if (manager) manager.mesaIncome += desk.managerShare;
  }
  for (const person of people)
    person.totalIncome = person.ownIncome + person.mesaIncome;
  return {
    people,
    desks: rows,
    gross: people.reduce((s, p) => s + p.gross, 0),
    nodalIncome: rows.reduce((s, d) => s + d.nodalShare, 0),
  };
}
