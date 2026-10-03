export class DataReadError extends Error {
  constructor(readonly reference: string) {
    super("No se pudieron cargar los datos.");
    this.name = "DataReadError";
  }
}

type ReadResult = { data: unknown; error: unknown };

/** Empty collections and zero balances are valid; failed or absent reads are not. */
export function requireSuccessfulReads<T extends readonly ReadResult[]>(results: T): T {
  const index = results.findIndex((result) => result.error || result.data === null || result.data === undefined);
  if (index >= 0) {
    const error = results[index].error as { code?: string } | null;
    throw new DataReadError(`${results.length}-${index + 1}-${error?.code || "READ"}`);
  }
  return results;
}

export function requireReadData<T>(result: { data: T | null; error: unknown }): T {
  requireSuccessfulReads([result]);
  return result.data as T;
}
