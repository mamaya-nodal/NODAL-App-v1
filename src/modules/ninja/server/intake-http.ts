/** Shared transport boundary. Never log or echo an untrusted body/error. */
export function ninjaIntakeResponse(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(status === 503 ? { "Retry-After": "15" } : {}),
    },
  });
}

type JsonReadResult = { ok: true; payload: unknown } | { ok: false; response: Response };

/** Enforce the byte budget while reading, including chunked/underdeclared bodies. */
export async function readNinjaJson(request: Request, maximumBytes: number, requireJsonContentType = true): Promise<JsonReadResult> {
  const fail = (status: number, error: string): JsonReadResult => ({
    ok: false, response: ninjaIntakeResponse({ error }, status),
  });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (requireJsonContentType && contentType !== "application/json") return fail(415, "El formato recibido no es válido.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength)))) {
    return fail(400, "El tamaño declarado no es válido.");
  }
  if (Number(declaredLength) > maximumBytes) return fail(413, "La actualización recibida es demasiado grande.");
  if (!request.body) return fail(400, "No se pudo leer la actualización de Ninja.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        // Cancellation may itself fail; still return the bounded rejection.
        void reader.cancel().catch(() => {});
        return fail(413, "La actualización recibida es demasiado grande.");
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, size);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return fail(400, "No se pudo leer la actualización de Ninja.");
  } finally {
    reader.releaseLock();
  }
}
