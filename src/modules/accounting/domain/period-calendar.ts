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

export function cutoffFridayForMonth(year: number, monthIndex: number): string {
  const anchor = new Date(Date.UTC(year, monthIndex, 15));
  const day = anchor.getUTCDay();
  const offset = day === 0 ? -2
    : day === 1 ? -3
      : day === 2 ? -4
        : day === 3 ? 2
          : day === 4 ? 1
            : day === 5 ? 0
              : -1;
  return isoDate(addUtcDays(anchor, offset));
}

export function openingMondayForMonth(year: number, monthIndex: number): string {
  return isoDate(addUtcDays(new Date(`${cutoffFridayForMonth(year, monthIndex)}T00:00:00Z`), 3));
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
  const openingCutoff = cutoffFridayForMonth(year, monthIndex);
  const isAtOrAfter = (date: string) => localDate > date || (localDate === date && localHour >= 19);
  const label = isAtOrAfter(openingCutoff)
    ? monthStart(year, monthIndex)
    : monthStart(year, monthIndex - 1);
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
  const operationalStartOn = openingMondayForMonth(year, monthIndex);
  const closeDate = cutoffFridayForMonth(year, monthIndex + 1);
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

export function clampDateToPeriodSchedule(
  businessDate: string,
  operationalStartOn: string,
  scheduledCloseAt: string,
): string {
  const closeDate = scheduledCloseAt.slice(0, 10);
  if (businessDate < operationalStartOn) return operationalStartOn;
  if (businessDate > closeDate) return closeDate;
  return businessDate;
}
