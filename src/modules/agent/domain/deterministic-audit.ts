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
  coverageComplete: boolean;
  coverageNotes: readonly string[];
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
  coverageComplete: boolean;
  coverageNotes: readonly string[];
  currentPeriod: string;
  findings: readonly NodalitoFinding[];
  historicalGrossInCents: number;
  operatedYesterday: readonly NodalitoAuditUser[];
  systemGrossInCents: number;
  users: readonly NodalitoAuditUser[];
  usersWithoutActivityYesterday: readonly NodalitoAuditUser[];
}>;

export type NodalitoAuditAnswer = Readonly<{
  coverageComplete: boolean;
  coverageNotes: readonly string[];
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
    coverageComplete: snapshot.coverageComplete,
    coverageNotes: snapshot.coverageNotes,
    currentPeriod: snapshot.currentPeriod,
    findings,
    historicalGrossInCents: snapshot.historicalGrossInCents,
    operatedYesterday: snapshot.users.filter((user) => user.lastOperatedOn === snapshot.yesterday),
    systemGrossInCents: snapshot.systemGrossInCents,
    users: snapshot.users,
    usersWithoutActivityYesterday: snapshot.users.filter((user) => user.lastOperatedOn !== snapshot.yesterday),
  };
}

const userSearchStopWords = new Set([
  "actual", "actuales", "aplicacion", "conciliacion", "conciliaciones", "completo", "detecta",
  "errores", "informe", "muchisimos", "problema", "problemas", "quiero", "reporte", "revisar",
  "tenia", "tiene", "todos", "usuario",
]);

export function resolveAuditUser(question: string, users: readonly NodalitoAuditUser[]) {
  const tokens = normalized(question).split(/[^a-z0-9@._-]+/).filter((token) => token.length >= 4 && !userSearchStopWords.has(token));
  const ranked = users.map((user) => {
    const aliases = normalized(`${user.name} ${user.email.split("@")[0]}`).split(/[^a-z0-9._-]+/).filter(Boolean);
    const score = tokens.reduce((best, token) => Math.max(best, ...aliases.map((alias) => {
      if (alias === token) return 4;
      if (alias.includes(token) || token.includes(alias)) return 3;
      return alias.length >= 4 && token.length >= 4 && alias.slice(0, 4) === token.slice(0, 4) ? 2 : 0;
    })), 0);
    return { score, user };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);
  if (!ranked.length) return { ambiguous: [] as readonly NodalitoAuditUser[], subject: null };
  const tied = ranked.filter((candidate) => candidate.score === ranked[0].score).map((candidate) => candidate.user);
  return tied.length === 1
    ? { ambiguous: [] as readonly NodalitoAuditUser[], subject: tied[0] }
    : { ambiguous: tied, subject: null };
}

export function answerDeterministicAudit(question: string, audit: NodalitoAudit, generatedAt: string): NodalitoAuditAnswer {
  const value = normalized(question);
  const userResolution = resolveAuditUser(question, audit.users);
  const subject = userResolution.subject;
  const wantsBilling = /factur|ganancia|resultado/.test(value);
  const wantsConnector = /conector|ninja|senal/.test(value);
  const wantsReconciliation = /concil|registro|error|problema/.test(value);
  const wantsActivity = /operaron|opero|actividad|ayer/.test(value);
  const wantsPayout = /payout|cobro/.test(value);
  const wantsCompleteUserReport = Boolean(subject) && /reporte completo|informe completo|todos.{0,20}(problemas|errores)|problemas.{0,20}(tiene|tenia)/.test(value);
  const focused = !wantsCompleteUserReport && (wantsBilling || wantsConnector || wantsReconciliation || wantsActivity || wantsPayout);
  const categories = new Set<NodalitoFindingCategory>();
  const coverage = {
    coverageComplete: audit.coverageComplete,
    coverageNotes: audit.coverageNotes,
  };
  if (wantsBilling) categories.add("billing");
  if (wantsConnector) categories.add("connector");
  if (wantsReconciliation) categories.add("reconciliation");
  if (wantsPayout) categories.add("payout");
  if (userResolution.ambiguous.length) {
    return {
      ...coverage,
      findings: [],
      generatedAt,
      summary: `Encontré más de un usuario posible: ${userResolution.ambiguous.map((user) => user.name).join(", ")}. Indicá el apellido para revisar a la persona correcta.`,
    };
  }
  const findings = audit.findings.filter((finding) =>
    (!subject || finding.userId === subject.id)
    && (!focused || categories.has(finding.category)),
  );

  if (subject) {
    const critical = findings.filter((finding) => finding.severity === "critical").length;
    const attention = findings.filter((finding) => finding.severity === "attention").length;
    const informational = findings.length - critical - attention;
    return {
      ...coverage,
      findings,
      generatedAt,
      summary: findings.length
        ? `${subject.name}: encontré ${findings.length} situaciones (${critical} críticas, ${attention} que requieren atención y ${informational} informativas).${audit.coverageComplete ? "" : " La investigación no pudo completar todas las fuentes, por lo que podrían existir otras."}`
        : audit.coverageComplete
          ? `${subject.name}: no encontré alertas de ${wantsReconciliation ? "conciliación " : ""}en las fuentes operativas revisadas.`
          : `${subject.name}: no encontré alertas en el resumen disponible, pero la investigación quedó incompleta y no puedo confirmar que no tenga problemas.`,
    };
  }

  if (wantsActivity) {
    const operated = audit.operatedYesterday.map((user) => user.name).join(", ") || "ningún usuario";
    const withoutActivity = audit.usersWithoutActivityYesterday.map((user) => user.name).join(", ") || "ninguno";
    return {
      ...coverage,
      findings,
      generatedAt,
      summary: `Ayer operaron ${audit.operatedYesterday.length} usuarios: ${operated}. Sin actividad registrada ayer: ${withoutActivity}. Una operación detectada pero no contabilizada aparece además como alerta de conciliación.`,
    };
  }

  if (wantsBilling) {
    return {
      ...coverage,
      findings,
      generatedAt,
      summary: `La facturación oficial del período ${audit.currentPeriod} es ${money(audit.systemGrossInCents)} y la histórica es ${money(audit.historicalGrossInCents)}. ${findings.length ? `Encontré ${findings.length} inconsistencia${findings.length === 1 ? "" : "s"} relacionada${findings.length === 1 ? "" : "s"}.` : "La suma de usuarios incluidos coincide con el total del sistema."}`,
    };
  }

  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const attention = findings.filter((finding) => finding.severity === "attention").length;
  return {
    ...coverage,
    findings,
    generatedAt,
    summary: findings.length
      ? `La revisión determinística encontró ${findings.length} situaciones: ${critical} críticas, ${attention} que requieren atención y ${findings.length - critical - attention} informativas.`
      : audit.coverageComplete
        ? "No encontré alertas en todas las fuentes operativas revisadas."
        : "No encontré alertas en el resumen disponible, pero la investigación no cubrió todas las fuentes y no confirma que el sistema esté libre de problemas.",
  };
}
