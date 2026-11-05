import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NodalitoFinding } from "../domain/deterministic-audit";
import { connectorVersionState } from "@/modules/ninja/domain/connector-version";

type ConnectorRow = Readonly<{
  connector_id: string;
  connector_version: string | null;
  identity_first_name: string | null;
  identity_id: string | null;
  identity_last_name: string | null;
  installed_source_version: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  status: string;
}>;

type ReconciliationRow = Readonly<{
  accounting_status: string;
  blocking_reason: string | null;
  broker_result_cents: number | null;
  company_name: string | null;
  id: string;
  opened_at: string;
}>;

function connectorName(row: ConnectorRow) {
  const identity = [row.identity_first_name, row.identity_last_name].filter(Boolean).join(" ");
  return identity || "Conector personal";
}

export async function runPersonalDiagnostic(supabase: SupabaseClient) {
  const [{ data: connectorData, error: connectorError }, { data: reconciliationData, error: reconciliationError }] = await Promise.all([
    supabase.rpc("get_current_user_ninja_connector_status_v2"),
    supabase.rpc("get_current_user_ninja_reconciliation_details", { target_limit: 100 }),
  ]);
  if (connectorError) throw connectorError;
  if (reconciliationError) throw reconciliationError;

  const connectors = (connectorData ?? []) as ConnectorRow[];
  const reconciliations = (Array.isArray(reconciliationData) ? reconciliationData : []) as ReconciliationRow[];
  const findings: NodalitoFinding[] = [];

  if (!connectors.length) {
    findings.push({
      category: "connector", detail: "No hay un conector vinculado a esta cuenta.", evidence: "La cuenta no devolvió instalaciones activas.",
      id: "personal:connector:missing", severity: "critical", title: "Conector no configurado", userId: null, userName: null,
    });
  }

  for (const connector of connectors) {
    const versionState = connectorVersionState({
      installedSourceVersion: connector.installed_source_version,
      runningVersion: connector.connector_version,
    });
    if (versionState === "update_available" || versionState === "unknown") {
      findings.push({
        category: "connector", detail: `${connectorName(connector)} no está ejecutando la versión vigente.`,
        evidence: `Versión informada: ${connector.connector_version ?? "sin informar"}.`, id: `personal:connector:version:${connector.connector_id}`,
        severity: "attention", title: "Conector desactualizado", userId: null, userName: null,
      });
    } else if (versionState === "pending_activation") {
      findings.push({
        category: "connector", detail: `${connectorName(connector)} descargó la actualización, pero todavía no informó la versión nueva.`,
        evidence: "La instalación debe reiniciarse para activar el ejecutable actualizado.", id: `personal:connector:pending:${connector.connector_id}`,
        severity: "attention", title: "Actualización pendiente de activación", userId: null, userName: null,
      });
    }
    if (!connector.is_online) {
      findings.push({
        category: "connector", detail: `${connectorName(connector)} no está transmitiendo señal en este momento.`,
        evidence: connector.last_seen_at ? `Última señal: ${connector.last_seen_at}.` : "Nunca informó una señal.",
        id: `personal:connector:offline:${connector.connector_id}`, severity: "info", title: "Conector sin señal actual", userId: null, userName: null,
      });
    }
  }

  for (const item of reconciliations.filter((row) => row.accounting_status !== "committed")) {
    findings.push({
      category: "reconciliation", detail: item.blocking_reason || "La operación fue detectada, pero no quedó contabilizada.",
      evidence: `${item.opened_at} · ${item.company_name ?? "Sin empresa asignada"} · resultado ${((item.broker_result_cents ?? 0) / 100).toFixed(2)} USD.`,
      id: `personal:reconciliation:${item.id}`, severity: item.accounting_status === "blocked" ? "critical" : "attention",
      title: item.accounting_status === "shadow_ready" ? "Conciliación pendiente de confirmación" : "Operación sin conciliar",
      userId: null, userName: null,
    });
  }

  return {
    findings,
    generatedAt: new Date().toISOString(),
    summary: findings.length
      ? `Encontré ${findings.length} situación${findings.length === 1 ? "" : "es"} en tu cuenta que conviene revisar.`
      : "Revisé tu conector y las conciliaciones visibles del ciclo actual. No encontré alertas pendientes.",
  };
}
