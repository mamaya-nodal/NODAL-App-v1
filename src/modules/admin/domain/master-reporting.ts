export const MASTER_REPORTING_START_MONTH = "2026-10-01";

export function isMasterReportingMonth(month: string) {
  return month >= MASTER_REPORTING_START_MONTH;
}
