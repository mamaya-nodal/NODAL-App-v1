const BUENOS_AIRES_OFFSET = "-03:00";

function monthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function firstMondayOfMonth(year: number, monthIndex: number): string {
  const first = monthStart(year, monthIndex);
  const daysUntilMonday = (8 - first.getUTCDay()) % 7;
  return isoDate(addUtcDays(first, daysUntilMonday));
}

export function accountingPeriodMonthAt(instant = new Date()): string {
  const buenosAires = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(instant);
  const parts = Object.fromEntries(buenosAires.map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const monthIndex = Number(parts.month) - 1;
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localHour = Number(parts.hour) % 24;
  const openingCutoff = isoDate(addUtcDays(
    new Date(`${firstMondayOfMonth(year, monthIndex)}T00:00:00Z`),
    -3,
  ));
  const nextCutoff = isoDate(addUtcDays(
    new Date(`${firstMondayOfMonth(year, monthIndex + 1)}T00:00:00Z`),
    -3,
  ));
  const isAtOrAfter = (date: string) => localDate > date || (localDate === date && localHour >= 19);
  const label = !isAtOrAfter(openingCutoff)
    ? monthStart(year, monthIndex - 1)
    : isAtOrAfter(nextCutoff)
      ? monthStart(year, monthIndex + 1)
      : monthStart(year, monthIndex);
  return `${isoDate(label).slice(0, 7)}-01`;
}

export function periodSchedule(periodMonth: string): Readonly<{
  operationalStartOn: string;
  scheduledCloseAt: string;
}> {
  const match = /^(\d{4})-(\d{2})-01$/.exec(periodMonth);
  if (!match) throw new Error("El período debe tener formato YYYY-MM-01.");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const operationalStartOn = firstMondayOfMonth(year, monthIndex);
  const nextFirstMonday = firstMondayOfMonth(year, monthIndex + 1);
  const closeDate = isoDate(addUtcDays(new Date(`${nextFirstMonday}T00:00:00Z`), -3));
  return {
    operationalStartOn,
    scheduledCloseAt: `${closeDate}T19:00:00${BUENOS_AIRES_OFFSET}`,
  };
}

export function dateBelongsToPeriodSchedule(
  businessDate: string,
  operationalStartOn: string,
  scheduledCloseAt: string,
): boolean {
  const closeDate = scheduledCloseAt.slice(0, 10);
  return businessDate >= operationalStartOn && businessDate <= closeDate;
}
