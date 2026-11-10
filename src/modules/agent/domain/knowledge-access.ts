import { NODALITO_GUIDES } from "./nodalito-faq";

export type NodalitoKnowledgeRole = "trader" | "admin" | "master";

export type NodalitoKnowledgeDocument = Readonly<{
  audience: readonly NodalitoKnowledgeRole[];
  content: string;
  id: string;
  title: string;
}>;

const commonDocuments: readonly NodalitoKnowledgeDocument[] = NODALITO_GUIDES.map((guide) => ({
  audience: ["trader", "admin", "master"],
  content: `${guide.summary}\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\nAcceso: ${guide.href}`,
  id: `guide:${guide.id}`,
  title: guide.question,
}));

const protectedDocuments: readonly NodalitoKnowledgeDocument[] = [
  {
    audience: ["master"],
    content: "Una conciliación Ninja sólo es completa cuando el lote, Control Diario, participantes, asientos por cuenta y estado visible en Cuentas coinciden. Registrar tarde una cuenta dispara un reproceso servidor de la telemetría conservada, hasta 45 días desde la compra, sin requerir actualización del conector. Si el evento nunca llegó al servidor, no debe fabricarse: requiere reconstrucción auditada.",
    id: "policy:reconciliation-account-projection",
    title: "Conciliación y Cuentas deben actualizarse juntas",
  },
  {
    audience: ["master"],
    content: "LucidFlex 50K usa MLL de USD 2.000 con trailing EOD: el piso inicial es USD 48.000 y se bloquea como máximo en USD 50.100 según cierres de sesión, no máximos intradía. El DLL opcional de USD 1.200 es un bloqueo blando hasta la sesión siguiente y no cierra la cuenta. Una quema confirmada es irreversible para esa vida; una lectura posterior superior no la revive.",
    id: "policy:lucid-flex-50k-risk",
    title: "Riesgo y quema de LucidFlex 50K",
  },
  {
    audience: ["trader", "admin", "master"],
    content: "No es necesario instalar el conector en todas las identidades registradas. Sólo cada identidad que efectivamente vaya a operar desde su propio NinjaTrader necesita instalar y vincular su conector desde su tarjeta. Una identidad que no opera no necesita conector.",
    id: "policy:identity-connector-requirement",
    title: "Cuándo una identidad necesita conector",
  },
  {
    audience: ["trader", "admin", "master"],
    content: "El correo de entrega de una identidad es sólo un destino logístico para recibir el instalador o actualización del conector y MIMICAL. No es una cuenta de acceso ni identifica a la identidad. El mismo correo puede usarse en varias identidades del mismo titular. Cada identidad conserva de todos modos su propia tarjeta, código de vinculación y conector.",
    id: "policy:identity-delivery-email",
    title: "Correo de entrega de identidades",
  },
  {
    audience: ["trader", "admin", "master"],
    content: "Compra de cuentas y origen de fondos: una compra se registra como `Aporte nuevo del trader` sólo si en el momento de pagarla se usó dinero externo que todavía no estaba registrado en ninguna billetera o cuenta bancaria de NODAL. Si se pagó con saldo que ya estaba en Binance u otra billetera registrada, su origen correcto es `Desde una billetera o cuenta bancaria`; no es un nuevo aporte. Si la compra ya formaba parte del punto de partida o ya tiene actividad posterior, no se debe cambiar el punto de partida ni inventar un movimiento para corregirla: hay que pedir una revisión contable para corregir el origen de esa compra sin alterar el resto del historial.",
    id: "policy:account-purchase-funds-origin",
    title: "Compra de cuentas pagada desde una billetera",
  },
  {
    audience: ["master"],
    content: "La auditoría global puede consultar facturación agregada, conectores, conciliaciones y payouts de todos los usuarios. Esta información nunca se incorpora al contexto de traders ni administradores de mesa.",
    id: "policy:master-audit",
    title: "Alcance de auditoría Admin Master",
  },
];

export const NODALITO_KNOWLEDGE: readonly NodalitoKnowledgeDocument[] = [
  ...commonDocuments,
  ...protectedDocuments,
];

export function knowledgeForRole(role: NodalitoKnowledgeRole): readonly NodalitoKnowledgeDocument[] {
  return NODALITO_KNOWLEDGE.filter((document) => document.audience.includes(role));
}

export function knowledgeContext(role: NodalitoKnowledgeRole): string {
  return knowledgeForRole(role)
    .map((document) => `## ${document.title}\n${document.content}`)
    .join("\n\n");
}
