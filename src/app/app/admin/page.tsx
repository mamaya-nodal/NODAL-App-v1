import { loadMasterControl } from "@/modules/admin/server/load-master-control";
import { MasterControlPanel } from "./master-control-panel";

type Props={searchParams:Promise<{period?:string}>};
export default async function AdminPage({searchParams}:Props){
  const params=await searchParams;
  return <MasterControlPanel data={await loadMasterControl(params.period)} />;
}
