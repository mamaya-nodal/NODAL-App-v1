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
