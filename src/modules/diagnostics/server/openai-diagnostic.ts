import "server-only";
import { createHash } from "node:crypto";
import type { DiagnosticAnswer, DiagnosticFacts } from "../domain/diagnostic-rules";

const schema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["verified", "probable", "unresolved"] },
    summary: { type: "string" }, cause: { type: "string" }, explainedDifferenceInCents: { type: "integer" },
    evidence: { type: "array", items: { type: "object", properties: { type: { type: "string" }, label: { type: "string" }, detail: { type: "string" } }, required: ["type", "label", "detail"], additionalProperties: false } },
    recommendedAction: { type: "string" }, simulationResultInCents: { type: ["integer", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] }, needsEscalation: { type: "boolean" },
  },
  required: ["status", "summary", "cause", "explainedDifferenceInCents", "evidence", "recommendedAction", "simulationResultInCents", "confidence", "needsEscalation"],
  additionalProperties: false,
} as const;

type ModelResult = Readonly<{ answer: DiagnosticAnswer; inputTokens: number; outputTokens: number }>;

function outputText(response: unknown): string | null {
  if (!response || typeof response !== "object" || !("output" in response) || !Array.isArray(response.output)) return null;
  for (const item of response.output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && typeof content === "object" && "type" in content && content.type === "output_text" && "text" in content && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

export async function askDiagnosticModel(input: Readonly<{
  facts: DiagnosticFacts;
  history: ReadonlyArray<Readonly<{ role: "assistant" | "user"; content: string }>>;
  model: "gpt-5.6-luna" | "gpt-5.6-terra";
  question: string;
  safetyUserId: string;
}>): Promise<ModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");
  const system = `Sos el asistente de diagnóstico de NODAL. Investigás alertas financieras usando solo los hechos suministrados. No inventes registros ni indiques que modificaste datos. Una causa está verificada únicamente si los importes explican exactamente la alerta y la simulación queda en cero. Si no podés demostrarlo, usa probable o unresolved. Explicá en español claro y breve. Nunca sugieras editar directamente la base: indicá qué registro debe revisarse.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model, store: false,
      reasoning: { effort: input.model === "gpt-5.6-luna" ? "low" : "medium", context: "current_turn" },
      max_output_tokens: input.model === "gpt-5.6-luna" ? 800 : 1_100,
      safety_identifier: createHash("sha256").update(input.safetyUserId).digest("hex"),
      input: [
        { role: "system", content: system },
        ...input.history.slice(-4),
        { role: "user", content: `Pregunta: ${input.question}\n\nExpediente verificado por NODAL:\n${JSON.stringify(input.facts)}` },
      ],
      text: { verbosity: "low", format: { type: "json_schema", name: "nodal_diagnostic", strict: true, schema } },
    }),
    signal: AbortSignal.timeout(input.model === "gpt-5.6-luna" ? 45_000 : 70_000),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  const payload: unknown = await response.json();
  const text = outputText(payload);
  if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
  const answer = JSON.parse(text) as DiagnosticAnswer;
  const usage = payload && typeof payload === "object" && "usage" in payload && payload.usage && typeof payload.usage === "object" ? payload.usage : {};
  return {
    answer,
    inputTokens: "input_tokens" in usage && typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: "output_tokens" in usage && typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
  };
}
