import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { canUseNodalAgentPilot } from "@/modules/agent/domain/pilot-access";

import { RutyxNavigator } from "../rutyx-navigator";

export default async function RutyxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  if (!canUseNodalAgentPilot(user.email)) redirect("/app");
  return <main className="nodal-workspace"><RutyxNavigator expanded /></main>;
}
