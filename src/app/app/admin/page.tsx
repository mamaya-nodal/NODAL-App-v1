import { loadMasterControl } from "@/modules/admin/server/load-master-control";
import { buildMasterControlDemo } from "@/modules/admin/server/master-control-demo";
import { canUseAdministrationDesignDemo } from "@/modules/admin/server/design-demo-access";
import { MasterControlPanel } from "./master-control-panel";

type Props={searchParams:Promise<{demo?: string | string[]; period?:string}>};
export default async function AdminPage({searchParams}:Props){
  const params=await searchParams;
  const [realData, demoAvailable] = await Promise.all([
    loadMasterControl(params.period),
    canUseAdministrationDesignDemo(),
  ]);
  const data = params.demo === "1" && demoAvailable ? buildMasterControlDemo() : realData;
  return <MasterControlPanel data={data} demoAvailable={demoAvailable} />;
}
