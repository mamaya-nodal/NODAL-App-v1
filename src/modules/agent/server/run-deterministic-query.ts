import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { loadMasterControl } from "@/modules/admin/server/load-master-control";
import {
  answerDeterministicAudit,
  buildDeterministicAudit,
  resolveAuditUser,
  type NodalitoAuditSnapshot,
} from "../domain/deterministic-audit";
import { runAccountingDiagnosticForOwner } from "./run-accounting-diagnostic";

function buenosAiresDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(now);
}

function previousDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function runDeterministicNodalitoQuery(question: string, now = new Date()) {
  const data = await loadMasterControl();
  const auditDate = buenosAiresDate(now);
  const excluded = new Set(data.excludedFromMasterReportingUserIds);
  const snapshot: NodalitoAuditSnapshot = {
    auditDate,
    coverageComplete: false,
    coverageNotes: ["La consulta global usa el resumen Admin Master. La investigación profunda se ejecuta al identificar un usuario."],
    currentPeriod: data.month,
    historicalGrossInCents: data.performanceHistory.reduce((total, period) => total + period.gross, 0),
    systemGrossInCents: data.overview.gross,
    users: data.overview.people.map((person) => {
      const detail = data.operationalDetailByUser[person.id];
      const liveStatus = data.traderLiveStatusByUser[person.id] ?? {
        light: "red" as const,
        message: "No tiene un conector NODAL activo.",
      };
      return {
        activeAccountCount: detail?.accounts.length ?? 0,
        connectorLight: liveStatus.light,
        connectorMessage: liveStatus.message,
        currentGrossInCents: person.gross,
        email: person.email,
        excludedFromReporting: excluded.has(person.id),
        historicalGrossInCents: data.historicalGrossByUser[person.id] ?? 0,
        id: person.id,
        lastOperatedOn: detail?.lastOperatedOn ?? null,
        name: person.name,
        pendingPayouts: detail?.pendingPayouts ?? [],
        reconciliationAlerts: (detail?.alerts ?? []).map((alert) => ({
          amountInCents: alert.amount,
          id: alert.id,
          occurredAt: alert.occurredAt,
          reason: alert.reason,
        })),
      };
    }),
    yesterday: previousDate(auditDate),
  };
  let audit = buildDeterministicAudit(snapshot);
  const resolution = resolveAuditUser(question, audit.users);
  if (resolution.subject) {
    try {
      const deepFindings = await runAccountingDiagnosticForOwner(
        createServiceClient(),
        resolution.subject.id,
        { now, recentOperationDays: 45 },
      );
      const findingsById = new Map(audit.findings.map((finding) => [finding.id, finding]));
      for (const finding of deepFindings) {
        findingsById.set(finding.id, {
          ...finding,
          userId: resolution.subject.id,
          userName: resolution.subject.name,
        });
      }
      audit = {
        ...audit,
        coverageComplete: true,
        coverageNotes: [
          "Se revisaron cuentas, compras, controles, vínculos, payouts, conectores, lotes, sesiones y eventos broker del usuario.",
          "Los lotes sin período contable se incluyen como anomalías y no se descartan por el mes del panel.",
        ],
        findings: [...findingsById.values()],
      };
    } catch (error) {
      console.error("nodalito_master_user_investigation_incomplete", error);
      audit = {
        ...audit,
        coverageComplete: false,
        coverageNotes: ["La investigación profunda no se completó. El resumen no permite declarar al usuario sin problemas."],
      };
    }
  }
  return answerDeterministicAudit(question, audit, now.toISOString());
}
