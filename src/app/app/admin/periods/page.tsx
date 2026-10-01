import { loadPeriodCloseControl } from "@/modules/accounting/server/load-period-close-control";
import { PeriodClosePanel } from "./period-close-panel";

export default async function AccountingPeriodsAdminPage() {
  return <PeriodClosePanel data={await loadPeriodCloseControl()} />;
}

