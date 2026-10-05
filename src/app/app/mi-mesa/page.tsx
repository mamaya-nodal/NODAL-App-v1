import { loadMyDeskPanel } from "@/modules/admin/server/load-my-desk";
import { buildAdminPanelDemo } from "@/modules/admin/server/admin-panel-demo";

import { MyDeskPanel } from "./my-desk-panel";

type Props = Readonly<{ searchParams: Promise<{ demo?: string | string[] }> }>;

export default async function MyDeskPage({ searchParams }: Props) {
  const realData = await loadMyDeskPanel();
  const params = await searchParams;
  const demoRequested = params.demo === "1";
  const data = demoRequested && realData.preview ? buildAdminPanelDemo() : realData;
  return <MyDeskPanel data={data} />;
}

