import { AsyncLocalStorage } from "node:async_hooks";

const attempts = new AsyncLocalStorage<{ failed: boolean }>();

/** Observe errors even when legacy processing represents them as empty results. */
export const observedNinjaFetch: typeof fetch = async (input, init) => {
  try {
    const response = await fetch(input, init);
    if (!response.ok) { const attempt = attempts.getStore(); if (attempt) attempt.failed = true; }
    return response;
  } catch (error) {
    const attempt = attempts.getStore(); if (attempt) attempt.failed = true;
    throw error;
  }
};

export async function runObservedNinjaProcessing(work: () => Promise<unknown>): Promise<boolean> {
  const attempt = { failed: false };
  return attempts.run(attempt, async () => {
    try { await work(); return !attempt.failed; } catch { return false; }
  });
}
