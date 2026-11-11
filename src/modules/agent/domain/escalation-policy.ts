export type NodalitoEscalation = Readonly<{
  kind: "human_help" | "suspected_manipulation";
  priority: "critical" | "normal";
  reason: string;
}>;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

const explicitHumanHelp = [
  /(?:quiero|necesito|prefiero|pido).{0,35}(?:hablar|contactar|comunicarme).{0,25}(?:persona|humano|equipo|agente|admin)/,
  /(?:hablar|contactar|comunicarme).{0,25}(?:con )?(?:el )?(?:equipo|agente|admin)(?: de)? nodal/,
  /(?:envia|manda|deriva|escala).{0,30}(?:caso|consulta|problema).{0,25}(?:equipo|agente|admin|nodal)/,
  /(?:ayuda|revision|asistencia).{0,25}(?:del|de un|del equipo).{0,20}(?:equipo|agente|admin|nodal)/,
];

const unsupportedManipulation = [
  /(?:inventa|fabrica|simula|hace pasar).{0,45}(?:payout|operacion|trade|deposito|facturacion|ganancia|saldo)/,
  /(?:borra|oculta|elimina).{0,35}(?:perdida|trade perdedor|operacion perdedora|deuda|comision)/,
  /(?:aumenta|infla|sube|duplica).{0,40}(?:facturacion|ganancia|payout|saldo).{0,35}(?:sin respaldo|sin evidencia|aunque no|que no exist)/,
  /(?:salta|evita|burla|engana).{0,35}(?:control|auditoria|conciliacion|regla|sistema)/,
  /(?:cambia|modifica).{0,35}(?:porcentaje|comision|reparto).{0,35}(?:sin autorizacion|sin permiso|para que yo|a mi favor)/,
];

/** Only escalates explicit human requests or explicit attempts to falsify the ledger. */
export function classifyNodalitoEscalation(question: string): NodalitoEscalation | null {
  const value = normalize(question);
  if (unsupportedManipulation.some((pattern) => pattern.test(value))) {
    return { kind: "suspected_manipulation", priority: "critical", reason: "La solicitud intenta alterar registros sin respaldo verificable." };
  }
  if (explicitHumanHelp.some((pattern) => pattern.test(value))) {
    return { kind: "human_help", priority: "normal", reason: "El usuario pidió expresamente asistencia del equipo de NODAL." };
  }
  return null;
}
