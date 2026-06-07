import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const openApiPath = join(projectRoot, "docs/api/openapi.yml");
const redoclyConfigPath = join(projectRoot, "docs/api/redocly.yaml");
const redoclyCliPath = join(workspaceRoot, "node_modules/@redocly/cli/bin/cli.js");

test("openApi_shouldPassRedoclyLint_onCanonicalContract", () => {
  const result = spawnSync(
    process.execPath,
    [redoclyCliPath, "lint", openApiPath, "--config", redoclyConfigPath],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
    },
  );

  assert.equal(
    result.status,
    0,
    [
      "Expected Agonara OpenAPI contract to pass Redocly lint.",
      result.stdout,
      result.stderr,
    ].join("\n"),
  );
});
