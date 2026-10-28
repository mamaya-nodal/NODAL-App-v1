import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { MIMICAL_VERSION } from "../domain/mimical-pilot";

export type MimicalPackageScope = "identity" | "personal";

export async function mimicalDownloadResponse(scope: MimicalPackageScope = "personal") {
  const filename = scope === "identity" ? "MIMICAL-NodalBots-Identity.zip" : "MIMICAL-NodalBots.zip";
  const archive = await readFile(join(process.cwd(), "private", "downloads", filename));
  return new Response(archive, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="MIMICAL-${MIMICAL_VERSION}-${scope === "identity" ? "Identidad-" : ""}NodalBots.zip"`,
      "Content-Length": String(archive.byteLength),
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
