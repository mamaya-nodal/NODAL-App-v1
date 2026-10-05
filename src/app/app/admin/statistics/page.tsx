import { loadMasterControl } from "@/modules/admin/server/load-master-control";
import { MasterControlPanel } from "../master-control-panel";

type Props = Readonly<{ searchParams: Promise<{ period?: string }> }>;

export default async function AdminStatisticsPage({ searchParams }: Props) {
  const { period } = await searchParams;
  return <MasterControlPanel data={await loadMasterControl(period)} view="statistics" />;
}
