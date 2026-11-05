export type NodalitoFindingSeverity = "critical" | "attention" | "info";
export type NodalitoFindingCategory = "billing" | "connector" | "reconciliation" | "activity" | "payout";

export type NodalitoAuditUser = Readonly<{
  activeAccountCount: number;
  connectorLight: "blue" | "gray" | "green" | "orange" | "red" | "yellow";
  connectorMessage: string;
  currentGrossInCents: number;
  email: string;
  excludedFromReporting: boolean;
  historicalGrossInCents: number;
  id: string;
  lastOperatedOn: string | null;
  name: string;
  pendingPayouts: readonly Readonly<{ amountInCents: number; approvedOn: string; id: string }>[];
  reconciliationAlerts: readonly Readonly<{ amountInCents: number; id: string; occurredAt: string; reason: string }>[];
}>;

export type NodalitoAuditSnapshot = Readonly<{
  auditDate: string;
  currentPeriod: string;
  historicalGrossInCents: number;
  systemGrossInCents: number;
  users: readonly NodalitoAuditUser[];
  yesterday: string;
}>;

export type NodalitoFinding = Readonly<{
  category: NodalitoFindingCategory;
  detail: string;
  evidence: string;
  id: string;
  severity: NodalitoFindingSeverity;
  title: string;
  userId: string | null;
  userName: string | null;
}>;

export type NodalitoAudit = Readonly<{
  auditDate: string;
  currentPeriod: string;
  findings: readonly NodalitoFinding[];
  historicalGrossInCents: number;
  operatedYesterday: readonly NodalitoAuditUser[];
  systemGrossInCents: number;
  usersWithoutActivityYesterday: readonly NodalitoAuditUser[];
}>;

export type NodalitoAuditAnswer = Readonly<{
  findings: readonly NodalitoFinding[];
  generatedAt: string;
  summary: string;
}>;

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(value / 100);
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function buildDeterministicAudit(snapshot: NodalitoAuditSnapshot): NodalitoAudit {
  const findings: NodalitoFinding[] = [];
  const reportingUsers = snapshot.users.filter((user) => !user.excludedFromReporting);
  const reconstructedGross = reportingUsers.reduce((total, user) => total + user.currentGrossInCents, 0);

  if (reconstructedGross !== snapshot.systemGrossInCents) {
    findings.push({
      category: "billing",
      detail: `El total oficial es ${money(snapshot.systemGrossInCents)}, pero la suma de usuarios incluidos da ${money(reconstructedGross)}.`,
      evidence: `Diferencia exacta: ${money(snapshot.systemGrossInCents - reconstructedGross)}.`,
      id: "system-billing-mismatch",
      severity: "critical",
      title: "La facturación total no coincide con sus usuarios",
      userId: null,
      userName: null,
    });
  }

  for (const user of snapshot.users) {
    for (const alert of user.reconciliationAlerts) {
      findings.push({
        category: "reconciliation",
        detail: alert.reason,
        evidence: `${alert.occurredAt} · Resultado detectado ${money(alert.amountInCents)} · lote ${alert.id}`,
        id: `reconciliation:${alert.id}`,
        severity: "critical",
        title: "Operación detectada sin conciliación contable",
        userId: user.id,
        userName: user.name,
      });
    }

    if (user.connectorLight === "red" || user.connectorLight === "orange" || user.connectorLight === "yellow") {
      findings.push({
        category: "connector",
        detail: user.connectorMessage,
        evidence: `Estado determinístico del panel: ${user.connectorLight}.`,
        id: `connector:${user.id}:${user.connectorLight}`,
        severity: user.connectorLight === "orange" ? "critical" : "attention",
        title: user.connectorLight === "red" ? "Conector no disponible o desactualizado" : "Conector requiere atención",
        userId: user.id,
        userName: user.name,
      });
    }

    for (const payout of user.pendingPayouts) {
      findings.push({
        category: "payout",
        detail: `Payout aprobado por ${money(payout.amountInCents)} todavía pendiente de acreditación.`,
        evidence: `Aprobado el ${payout.approvedOn} · payout ${payout.id}`,
        id: `payout:${payout.id}`,
        severity: "info",
        title: "Payout pendiente de cobro",
        userId: user.id,
        userName: user.name,
      });
    }
  }

  return {
    auditDate: snapshot.auditDate,
    currentPeriod: snapshot.currentPeriod,
    findings,
    historicalGrossInCents: snapshot.historicalGrossInCents,
    operatedYesterday: snapshot.users.filter((user) => user.lastOperatedOn === snapshot.yesterday),
    systemGrossInCents: snapshot.systemGrossInCents,
    usersWithoutActivityYesterday: snapshot.users.filter((user) => user.lastOperatedOn !== snapshot.yesterday),
  };
}

export function answerDeterministicAudit(question: string, audit: NodalitoAudit, generatedAt: string): NodalitoAuditAnswer {
  const value = normalized(question);
  const wantsBilling = /factur|ganancia|resultado/.test(value);
  const wantsConnector = /conector|ninja|senal/.test(value);
  const wantsReconciliation = /concil|registro|error|problema/.test(value);
  const wantsActivity = /operaron|opero|actividad|ayer/.test(value);
  const wantsPayout = /payout|cobro/.test(value);
  const focused = wantsBilling || wantsConnector || wantsReconciliation || wantsActivity || wantsPayout;
  const categories = new Set<NodalitoFindingCategory>();
  if (wantsBilling) categories.add("billing");
  if (wantsConnector) categories.add("connector");
  if (wantsReconciliation) categories.add("reconciliation");
  if (wantsPayout) categories.add("payout");
  const findings = audit.findings.filter((finding) => !focused || categories.has(finding.category));

  if (wantsActivity) {
    const operated = audit.operatedYesterday.map((user) => user.name).join(", ") || "ningún usuario";
    const withoutActivity = audit.usersWithoutActivityYesterday.map((user) => user.name).join(", ") || "ninguno";
    return {
      findings,
      generatedAt,
      summary: `Ayer operaron ${audit.operatedYesterday.length} usuarios: ${operated}. Sin actividad registrada ayer: ${withoutActivity}. Una operación detectada pero no contabilizada aparece además como alerta de conciliación.`,
    };
  }

  if (wantsBilling) {
    return {
      findings,
      generatedAt,
      summary: `La facturación oficial del período ${audit.currentPeriod} es ${money(audit.systemGrossInCents)} y la histórica es ${money(audit.historicalGrossInCents)}. ${findings.length ? `Encontré ${findings.length} inconsistencia${findings.length === 1 ? "" : "s"} relacionada${findings.length === 1 ? "" : "s"}.` : "La suma de usuarios incluidos coincide con el total del sistema."}`,
    };
  }

  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const attention = findings.filter((finding) => finding.severity === "attention").length;
  return {
    findings,
    generatedAt,
    summary: findings.length
      ? `La revisión determinística encontró ${findings.length} situaciones: ${critical} críticas, ${attention} que requieren atención y ${findings.length - critical - attention} informativas.`
      : "No encontré alertas con las reglas determinísticas disponibles.",
  };
}
