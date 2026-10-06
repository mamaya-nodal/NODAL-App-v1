import { loadPeriodCloseControl } from "@/modules/accounting/server/load-period-close-control";
import { canUseAdministrationDesignDemo } from "@/modules/admin/server/design-demo-access";
import { buildMasterControlDemo } from "@/modules/admin/server/master-control-demo";
import { PeriodClosePanel } from "./period-close-panel";
import { PeriodRecordsDemo } from "./period-records-demo";

type Props = Readonly<{ searchParams: Promise<{ demo?: string | string[] }> }>;

export default async function AccountingPeriodsAdminPage({ searchParams }: Props) {
  const { demo } = await searchParams;
  if (demo === "1" && await canUseAdministrationDesignDemo()) {
    return <PeriodRecordsDemo data={buildMasterControlDemo()} />;
  }
  return <PeriodClosePanel data={await loadPeriodCloseControl()} />;
}

