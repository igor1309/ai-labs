import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("test_defaultDigestSchema_shouldLiveInYaml_notHardcodedTypescript", async () => {
  const schemaPath = path.join(packageDir, "digest-schema.yaml");
  const schemaBody = await fs.readFile(schemaPath, "utf8").catch(() => "");
  const sectionsSource = await fs.readFile(path.join(packageDir, "src", "sections.ts"), "utf8").catch(() => "");

  assert.deepEqual({
    hasYamlSchema: schemaBody.includes("sections:"),
    hardcodesDefaultHeading: sectionsSource.includes("\"Session summary\""),
  }, {
    hasYamlSchema: true,
    hardcodesDefaultHeading: false,
  });
});
