import { createClient } from "@/lib/supabase/server";

import {
  parseAdministrationScope,
  type AdministrationScope,
  type AdministrationScopeRow,
} from "../domain/administration-scope";

export async function loadMyAdministrationScope(): Promise<AdministrationScope> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "none" };

  const { data, error } = await supabase.rpc("get_my_administration_scope");
  if (error) return { kind: "none" };

  const row = Array.isArray(data) ? data[0] : data;
  return parseAdministrationScope(row as AdministrationScopeRow | null | undefined);
}

