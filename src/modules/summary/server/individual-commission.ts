import { createClient } from "@/lib/supabase/server";
export async function loadIndividualCommission(
  userId: string,
  month: string,
): Promise<number | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("nodal_user_terms")
    .select("commission_bps")
    .eq("user_id", userId)
    .lte("effective_month", month)
    .order("effective_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("No se pudo verificar el acuerdo de comisión.");
  return data ? Number(data.commission_bps) : null;
}
