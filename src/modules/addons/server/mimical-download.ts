import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { MIMICAL_VERSION } from "../domain/mimical-pilot";

export async function mimicalDownloadResponse() {
  const archive = await readFile(join(process.cwd(), "private", "downloads", "MIMICAL-NodalBots.zip"));
  return new Response(archive, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="MIMICAL-${MIMICAL_VERSION}-NodalBots.zip"`,
      "Content-Length": String(archive.byteLength),
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
