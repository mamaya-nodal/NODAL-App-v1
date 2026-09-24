import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CONNECTOR_FILENAME = "NODAL-Ninja-Connector.zip";

export async function connectorDownloadResponse() {
  const archive = await readFile(join(process.cwd(), "private", "downloads", CONNECTOR_FILENAME));
  return new Response(archive, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${CONNECTOR_FILENAME}"`,
      "Content-Length": String(archive.byteLength),
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
