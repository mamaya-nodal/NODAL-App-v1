import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { closeDueAccountingPeriods } from "@/modules/accounting/server/close-due-periods";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Configuración del cierre incompleta." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Configuración del cierre incompleta." }, { status: 503 });
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const outcome = await closeDueAccountingPeriods(supabase);
    return NextResponse.json(outcome, { status: outcome.failed.length > 0 ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo ejecutar el cierre.",
    }, { status: 500 });
  }
}
