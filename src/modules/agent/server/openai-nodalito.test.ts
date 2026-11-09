import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./openai-knowledge-store", () => ({ nodalitoKnowledgeStore: async () => null }));
vi.mock("./run-deterministic-query", () => ({ runDeterministicNodalitoQuery: vi.fn(() => { throw new Error("private_admin_data"); }) }));
import { askNodalito } from "./openai-nodalito";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const input = { role: "trader" as const, question: "Me olvidé de cargar el payout", safetyUserId: "trader", personalDiagnostic: async () => ({ findings: [], generatedAt: "now", summary: "ok" }) };
function mockResponses(outputs: unknown[]) {
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-secret");
  const fetch = vi.fn();
  for (const output of outputs) fetch.mockResolvedValueOnce({ ok: true, json: async () => output });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("prepares a proposal without calling a financial executor", async () => {
  mockResponses([{ output: [{ type: "function_call", name: "prepare_my_repair", call_id: "call", arguments: JSON.stringify({ action: "approve_payout", periodId: "period", parametersJson: "{}" }) }] }]);
  const prepareRepair = vi.fn(async () => ({ planId: "plan", label: "Payout", parameters: {} }));
  const result = await askNodalito({ ...input, readRepairContext: async () => ({}), prepareRepair });
  expect(result.mode).toBe("repair");
  expect(prepareRepair).toHaveBeenCalledOnce();
  expect(result.text).not.toContain("aplicada");
});
it("does not dispatch a fabricated master tool call for a trader", async () => {
  mockResponses([{ output: [{ type: "function_call", name: "read_admin_master_audit", call_id: "call", arguments: "{}" }] }]);
  const result = await askNodalito(input);
  expect(result.mode).toBe("knowledge");
  expect(result.text).not.toContain("private_admin_data");
});
it("bounds repeated investigation calls", async () => {
  const output = { output: [{ type: "function_call", name: "investigate_my_issue", call_id: "call", arguments: JSON.stringify({ question: "Revisá mi cuenta" }) }] };
  const fetch = mockResponses(Array(7).fill(output));
  const readRepairContext = vi.fn(async () => ({}));
  const result = await askNodalito({ ...input, readRepairContext, prepareRepair: async () => ({ planId: "plan", label: "Payout", parameters: {} }) });
  expect(readRepairContext).toHaveBeenCalledTimes(6);
  expect(fetch).toHaveBeenCalledTimes(7);
  expect(result.mode).toBe("knowledge");
});

it("investigates a real user issue before answering", async () => {
  mockResponses([
    { output: [{ type: "function_call", name: "investigate_my_issue", call_id: "inspect", arguments: JSON.stringify({ question: "Tengo una transferencia pendiente" }) }] },
    { output_text: "La transferencia fue detectada por un cambio entre el saldo esperado y el saldo observado." },
  ]);
  const readRepairContext = vi.fn(async () => ({ brokerTransfers: [{ amount_cents: 234888 }] }));
  const result = await askNodalito({ ...input, question: "Tengo una transferencia pendiente", readRepairContext, prepareRepair: async () => ({ planId: "plan", label: "Transferencia", parameters: {} }) });
  expect(readRepairContext).toHaveBeenCalledWith("Tengo una transferencia pendiente");
  expect(result.text).toContain("fue detectada");
});
