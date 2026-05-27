import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { startServer } from "../src/server.js";

test("backendSkeleton_shouldExposeServerEntrypoint_onStepOne", () => {
  const serverEntrypoint = new URL("../src/server.js", import.meta.url);

  assert.equal(existsSync(serverEntrypoint), true);
});

test("startServer_shouldRejectMissingBootstrapSecret_onRuntimeEntrypoint", () => {
  assert.throws(() => startServer({ bootstrapSecret: "" }), /AGONARA_BOOTSTRAP_SECRET is required/);
});

test("serverModule_shouldImportWithoutEntrypointArg_onEmbeddedUse", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "process.argv.splice(1); await import('./src/server.js');",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
});
