// Writes dist/, which Chrome or Yandex Browser loads unpacked: the manifest,
// and each script it names (content scripts and the background worker) bundled with its imports into one file,
// since a content script cannot be an ES module. Fails when the manifest
// names a missing file.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const scripts = [...manifest.content_scripts.flatMap((script) => script.js), manifest.background.service_worker];

for (const file of scripts) {
  if (!existsSync(join(root, file))) throw new Error(`manifest names a missing file: ${file}`);
}
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
cpSync(join(root, "manifest.json"), join(dist, "manifest.json"));
for (const file of scripts) {
  await build({ entryPoints: [join(root, file)], outfile: join(dist, file), bundle: true, format: "iife", target: "chrome120" });
}
console.log(`built ${dist}`);
