import "server-only";

import { createHash } from "node:crypto";

import { NODALITO_CORPORA, NODALITO_CORPUS_VERSION } from "../generated/knowledge-corpus";
import type { NodalitoKnowledgeRole } from "../domain/knowledge-access";

type VectorStore = Readonly<{ id: string; name?: string }>;
type VectorStoreFile = Readonly<{ status?: string }>;

const resolvedStores = new Map<NodalitoKnowledgeRole, Promise<string | null>>();

async function openaiRequest(path: string, init: RequestInit = {}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`OpenAI knowledge store ${response.status}`);
  return response;
}

async function waitUntilIndexed(storeId: string, fileId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await openaiRequest(`/vector_stores/${storeId}/files/${fileId}`);
    if (!response) return false;
    const state = await response.json() as VectorStoreFile;
    if (state.status === "completed") return true;
    if (state.status === "failed" || state.status === "cancelled") return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function resolveStore(role: NodalitoKnowledgeRole): Promise<string | null> {
  const corpus = NODALITO_CORPORA[role];
  const fingerprint = createHash("sha256").update(corpus).digest("hex").slice(0, 12);
  const name = `nodalito-${role}-${NODALITO_CORPUS_VERSION}-${fingerprint}`;
  const listResponse = await openaiRequest("/vector_stores?limit=100");
  if (!listResponse) return null;
  const list = await listResponse.json() as { data?: readonly VectorStore[] };
  const existing = list.data?.find((store) => store.name === name);
  if (existing) return existing.id;

  const storeResponse = await openaiRequest("/vector_stores", {
    body: JSON.stringify({ name }),
    method: "POST",
  });
  if (!storeResponse) return null;
  const store = await storeResponse.json() as VectorStore;

  const form = new FormData();
  form.set("purpose", "assistants");
  form.set("file", new Blob([corpus], { type: "text/plain" }), `nodalito-${role}-${NODALITO_CORPUS_VERSION}.txt`);
  const fileResponse = await openaiRequest("/files", { body: form, method: "POST" });
  if (!fileResponse) return null;
  const file = await fileResponse.json() as { id: string };
  await openaiRequest(`/vector_stores/${store.id}/files`, {
    body: JSON.stringify({ file_id: file.id }),
    method: "POST",
  });
  return await waitUntilIndexed(store.id, file.id) ? store.id : null;
}

export function nodalitoKnowledgeStore(role: NodalitoKnowledgeRole) {
  const current = resolvedStores.get(role);
  if (current) return current;
  const pending = resolveStore(role).catch((error) => {
    console.error("nodalito_knowledge_store_failed", error);
    return null;
  });
  resolvedStores.set(role, pending);
  return pending;
}
