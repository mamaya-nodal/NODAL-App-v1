import { createServiceClient } from "@/lib/supabase/service";
import { requireNodalAdmin } from "./admin-access";

export async function adminReportingDb(privilegedRead: boolean) {
  const authorizedDb = await requireNodalAdmin();
  return privilegedRead ? createServiceClient() : authorizedDb;
}
