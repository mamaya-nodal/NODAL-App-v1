import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

export type AdminStudentOverview = Readonly<{
  activityLabel: string;
  activityState: "active_today" | "recent" | "inactive" | "no_activity";
  capitalInCents: number;
  commissionInCents: number;
  email: string;
  id: string;
  name: string;
  performanceLabel: string;
  performanceState: "winning" | "losing" | "neutral";
  realizedGainInCents: number;
  summary: OperationalSummary;
}>;

type StudentInput = Readonly<{
  email: string;
  id: string;
  lastOperatedOn: string | null;
  name: string | null;
  summary: OperationalSummary;
}>;

function calendarDaysBetween(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.floor((toTime - fromTime) / 86_400_000));
}

function activity(lastOperatedOn: string | null, today: string): Pick<AdminStudentOverview, "activityLabel" | "activityState"> {
  if (!lastOperatedOn) return { activityLabel: "Sin operatoria registrada", activityState: "no_activity" };
  const days = calendarDaysBetween(lastOperatedOn, today);
  if (days === 0) return { activityLabel: "Operó hoy", activityState: "active_today" };
  if (days === 1) return { activityLabel: "Operó ayer", activityState: "recent" };
  if (days <= 3) return { activityLabel: `Operó hace ${days} días`, activityState: "recent" };
  return { activityLabel: `Sin operar hace ${days} días`, activityState: "inactive" };
}

function performance(realizedGainInCents: number): Pick<AdminStudentOverview, "performanceLabel" | "performanceState"> {
  if (realizedGainInCents > 0) return { performanceLabel: "Viene ganando", performanceState: "winning" };
  if (realizedGainInCents < 0) return { performanceLabel: "Viene perdiendo", performanceState: "losing" };
  return { performanceLabel: "Sin resultado realizado", performanceState: "neutral" };
}

export function buildAdminStudentOverview(input: StudentInput, today: string): AdminStudentOverview {
  return {
    ...activity(input.lastOperatedOn, today),
    ...performance(input.summary.realizedGainInCents),
    capitalInCents: input.summary.capitalNetInCents,
    commissionInCents: input.summary.commissionInCents,
    email: input.email,
    id: input.id,
    name: input.name?.trim() || input.email,
    realizedGainInCents: input.summary.realizedGainInCents,
    summary: input.summary,
  };
}

export function summarizeAdminOverview(students: readonly AdminStudentOverview[]) {
  return {
    activeRecently: students.filter((student) => student.activityState === "active_today" || student.activityState === "recent").length,
    totalCommissionInCents: students.reduce((total, student) => total + student.commissionInCents, 0),
    totalStudents: students.length,
    winningStudents: students.filter((student) => student.performanceState === "winning").length,
  };
}
