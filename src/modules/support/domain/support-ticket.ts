export const SUPPORT_CATEGORIES = [
  { label: "Problema técnico", value: "technical" },
  { label: "Cuentas y operaciones", value: "operations" },
  { label: "Contabilidad", value: "accounting" },
  { label: "Otro", value: "other" },
] as const;

export type SupportCategory = typeof SUPPORT_CATEGORIES[number]["value"];

export type SupportTicketDraft = Readonly<{
  category: SupportCategory;
  description: string;
  subject: string;
}>;

export function prepareSupportTicket(input: Readonly<Record<string, unknown>>): SupportTicketDraft | null {
  const category = String(input.category ?? "").trim() as SupportCategory;
  const subject = String(input.subject ?? "").trim().replace(/\s+/g, " ");
  const description = String(input.description ?? "").trim();
  if (!SUPPORT_CATEGORIES.some((option) => option.value === category)) return null;
  if (subject.length < 5 || subject.length > 120) return null;
  if (description.length < 20 || description.length > 4000) return null;
  return { category, description, subject };
}

export function supportCategoryLabel(category: SupportCategory): string {
  return SUPPORT_CATEGORIES.find((option) => option.value === category)?.label ?? "Otro";
}
