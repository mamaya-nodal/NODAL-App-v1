import { loadMyDeskPanel } from "@/modules/admin/server/load-my-desk";

import { MyDeskPanel } from "./my-desk-panel";

export default async function MyDeskPage() {
  return <MyDeskPanel data={await loadMyDeskPanel()} />;
}

