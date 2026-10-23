import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { LATEST_NINJA_CONNECTOR_VERSION } from "../domain/connector-version";

const CONNECTOR_FILENAME = "NODAL-Conector.exe";

function downloadFilename(code: string) {
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error("Invalid installer authorization");
  return `NODAL-Conector-${LATEST_NINJA_CONNECTOR_VERSION}-ENLACE-${code}.exe`;
}

export async function connectorDownloadResponse(code: string) {
  const executable = await readFile(join(process.cwd(), "private", "downloads", CONNECTOR_FILENAME));
  const filename = downloadFilename(code);
  return new Response(executable, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(executable.byteLength),
      "Content-Type": "application/vnd.microsoft.portable-executable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
