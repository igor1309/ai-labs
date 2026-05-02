import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("test_sources_shouldNotImportDeepAgents_onV2Pipeline", async () => {
  const sources = await sourceFiles(path.join(packageDir, "src"));
  const contents = await Promise.all(sources.map(($0) => fs.readFile($0, "utf8")));

  assert.equal(contents.some(($0) => $0.includes("deepagents")), false);
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async ($0) => {
    const entryPath = path.join(directory, $0.name);

    if ($0.isDirectory()) {
      return sourceFiles(entryPath);
    }

    return $0.isFile() && $0.name.endsWith(".ts") ? [entryPath] : [];
  }));

  return nested.flat();
}
