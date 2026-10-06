import { loadPeriodCloseControl } from "@/modules/accounting/server/load-period-close-control";
import { canUseAdministrationDesignDemo } from "@/modules/admin/server/design-demo-access";
import { loadMasterControl } from "@/modules/admin/server/load-master-control";
import { buildMasterControlDemo } from "@/modules/admin/server/master-control-demo";
import { PeriodRecordsDemo } from "./period-records-demo";
import { PeriodRecordsPanel } from "./period-records-panel";

type Props = Readonly<{ searchParams: Promise<{ demo?: string | string[] }> }>;

export default async function AccountingPeriodsAdminPage({ searchParams }: Props) {
  const { demo } = await searchParams;
  if (demo === "1" && await canUseAdministrationDesignDemo()) {
    return <PeriodRecordsDemo data={buildMasterControlDemo()} />;
  }
  const [closeData, masterData] = await Promise.all([
    loadPeriodCloseControl(),
    loadMasterControl(),
  ]);
  return <PeriodRecordsPanel closeData={closeData} masterData={masterData} />;
}

