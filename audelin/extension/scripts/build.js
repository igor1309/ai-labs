// Copies the manifest and every file it names into dist/, which Chrome or
// Yandex Browser loads unpacked. Fails when the manifest names a missing file.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const files = manifest.content_scripts.flatMap((script) => script.js);

for (const file of files) {
  if (!existsSync(join(root, file))) throw new Error(`manifest names a missing file: ${file}`);
}
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const file of ["manifest.json", ...files]) {
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  cpSync(join(root, file), join(dist, file));
}
console.log(`built ${dist}`);
