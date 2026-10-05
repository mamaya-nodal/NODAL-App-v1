import "server-only";

import { createClient } from "@/lib/supabase/server";
import { canAccessAdministrationDesignDemo } from "../domain/design-demo-access";

export async function canUseAdministrationDesignDemo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return canAccessAdministrationDesignDemo(user?.email);
}
