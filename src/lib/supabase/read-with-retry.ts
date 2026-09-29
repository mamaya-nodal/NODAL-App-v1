type ReadError = { code?: string; status?: number };

/** Only for reads: retries never replay an economic mutation. */
export async function readWithRetry<T extends { error: ReadError | null }>(
  read: () => PromiseLike<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await read();
      const error = result.error;
      const retryable = error && (
        error.code === "PGRST301" || error.code === "PGRST303" ||
        error.code === "57014" || error.code === "" ||
        error.status === 401 || error.status === 429 ||
        (error.status !== undefined && error.status >= 500)
      );
      if (!retryable || attempt === 2) return result;
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
}

export function reportReadFailure(scope: string, error: ReadError) {
  // Do not log tokens, query strings or personal data.
  console.error("NODAL_READ_FAILED", { scope, code: error.code, status: error.status });
}
