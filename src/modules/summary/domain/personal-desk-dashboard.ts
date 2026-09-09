import {
  bonusBps,
  type calculateDeskOverview,
} from "@/modules/admin/domain/desks";

import {
  buildPeriodEarnings,
  type PersonalDashboardData,
} from "./personal-dashboard";

type DeskOverview = ReturnType<typeof calculateDeskOverview>;

export type PersonalDeskSnapshot = Readonly<{
  month: string;
  overview: DeskOverview;
}>;

const DESK_CAPACITY = 10;

export function buildPersonalDeskDashboard(input: Readonly<{
  currentMonth: string;
  snapshots: readonly PersonalDeskSnapshot[];
  userId: string;
}>): PersonalDashboardData | null {
  const snapshots = [...input.snapshots].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const current = snapshots.find((snapshot) => snapshot.month === input.currentMonth);
  const person = current?.overview.people.find((candidate) => candidate.id === input.userId);
  if (!current || !person) return null;

  const managedDesk = current.overview.desks.find(
    (desk) => desk.terms.active && desk.terms.manager_id === input.userId,
  );
  const referredDeskCount = managedDesk?.children.length ?? 0;
  const receivesReferralBonus = Boolean(
    managedDesk && referredDeskCount > 0 && person.terms?.bonus_enabled,
  );
  const capabilities: NonNullable<PersonalDashboardData["capabilities"]> = {
    ...(managedDesk ? { managedDesk: {
      billingInCents: managedDesk.gross,
      capacity: DESK_CAPACITY,
      users: managedDesk.members.length,
    } } : {}),
    ...(receivesReferralBonus ? { referredDesks: {
      bonusBps: bonusBps(referredDeskCount),
      capacity: DESK_CAPACITY,
      desks: referredDeskCount,
    } } : {}),
  };

  return {
    ...(Object.keys(capabilities).length > 0 ? { capabilities } : {}),
    billingInCents: person.gross,
    earnings: buildPeriodEarnings({
      deskAdministrationInCents: managedDesk ? person.mesaIncome : null,
      level: person.terms?.level ?? null,
      ownOperationsInCents: person.ownIncome,
      referredDesksInCents: receivesReferralBonus ? person.bonus : null,
    }),
    history: snapshots.flatMap((snapshot) => {
      const historicalPerson = snapshot.overview.people.find(
        (candidate) => candidate.id === input.userId,
      );
      return historicalPerson
        ? [{
            billingInCents: historicalPerson.gross,
            earningsInCents: historicalPerson.totalIncome,
            periodMonth: snapshot.month,
          }]
        : [];
    }),
  };
}
