import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "src", "modules", "agent", "generated");
const outputFile = path.join(outputDir, "knowledge-corpus.ts");
const trackedFiles = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/")),
);

async function filesBelow(relativeDirectory, extensions) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((file) => trackedFiles.has(file))
    .sort();
}

async function corpus(files) {
  const sections = [];
  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8");
    sections.push(`\n\n===== FUENTE: ${file} =====\n${content}`);
  }
  return sections.join("");
}

const commonFiles = [
  "src/modules/agent/domain/nodalito-faq.ts",
  "src/modules/agent/domain/knowledge-access.ts",
  "docs/38_WALLETS_CRIPTO.md",
  "docs/43_NINJA_INSTALLER_PILOT.md",
  "docs/CONTEXTO_Y_DEFINICIONES_MIMICAL_NODAL_2026-10-26.md",
  "docs/MIMICAL_POSITION_SETTLEMENT_2026-11-02.md",
  "docs/MIMICAL_STOPLIMIT_2026-10-26.md",
];

const domainFiles = (await filesBelow("src/modules", [".ts"]))
  .filter((file) => !file.includes("/agent/generated/"));
const migrationFiles = await filesBelow("supabase/migrations", [".sql"]);
const documentationFiles = await filesBelow("docs", [".md", ".mp"]);
const adminFiles = domainFiles.filter((file) =>
  /\/(admin|accounting|control-diario|diagnostics|operations|summary|wallets|ninja)\//.test(file)
  && !file.endsWith(".test.ts"),
);
const masterFiles = [...new Set([...documentationFiles, ...domainFiles, ...migrationFiles])];

const common = await corpus(commonFiles);
const admin = await corpus([...new Set([...commonFiles, ...adminFiles])]);
const master = await corpus(masterFiles);
const version = createHash("sha256").update(common).update(admin).update(master).digest("hex").slice(0, 16);

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `// Generado por scripts/build-nodalito-corpus.mjs. No editar manualmente.\nexport const NODALITO_CORPUS_VERSION = ${JSON.stringify(version)};\nexport const NODALITO_CORPORA = ${JSON.stringify({ admin, master, trader: common })} as const;\n`);
console.log(`Nodalito corpus ${version}: trader=${common.length}, admin=${admin.length}, master=${master.length}`);
