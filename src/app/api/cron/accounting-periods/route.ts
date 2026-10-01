import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { runAccountingPeriodClose } from "@/modules/accounting/server/run-period-close";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Configuración del cierre incompleta." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const outcome = await runAccountingPeriodClose(createServiceClient(), "scheduled");
    if (outcome.failed.length > 0) {
      console.error("Accounting period close failures", outcome.failed);
    }
    return NextResponse.json(outcome, { status: outcome.failed.length > 0 ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo ejecutar el cierre.",
    }, { status: 500 });
  }
}
