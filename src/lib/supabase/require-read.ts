export class DataReadError extends Error {
  constructor() {
    super("No se pudieron cargar los datos.");
    this.name = "DataReadError";
  }
}

type ReadResult = { data: unknown; error: unknown };

/** Empty collections and zero balances are valid; failed or absent reads are not. */
export function requireSuccessfulReads<T extends readonly ReadResult[]>(results: T): T {
  if (results.some((result) => result.error || result.data === null || result.data === undefined)) {
    throw new DataReadError();
  }
  return results;
}

export function requireReadData<T>(result: { data: T | null; error: unknown }): T {
  requireSuccessfulReads([result]);
  return result.data as T;
}
