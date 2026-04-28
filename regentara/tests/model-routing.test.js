import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { StartupValidationFailure } from "../src/errors.js";
import { resolveModelRouting } from "../src/settings/model-routing.js";
import {
  makeSettingsWorkspace,
  validModelsYaml,
  writeGlobalSettings,
  writeLocalSettings,
} from "./helpers/settings.js";

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

test("resolveModelRouting should fail before creating a run when neither local nor global models yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();
  const examplePath = join(workspace.homeDirectory, ".regentara", "models.yaml.example");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    (error) =>
      error instanceof StartupValidationFailure
      && error.message.includes("models.yaml not found")
      && error.message.includes(examplePath),
  );
});

test("resolveModelRouting should write models.yaml.example to the home directory when no models.yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();
  const examplePath = join(workspace.homeDirectory, ".regentara", "models.yaml.example");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await pathExists(examplePath), true);
});

test("resolveModelRouting should not overwrite an existing models.yaml.example", async () => {
  const workspace = await makeSettingsWorkspace();
  const exampleDir = join(workspace.homeDirectory, ".regentara");
  const examplePath = join(exampleDir, "models.yaml.example");
  await mkdir(exampleDir, { recursive: true });
  await writeFile(examplePath, "user-edited-example");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await readFile(examplePath, "utf8"), "user-edited-example");
});

test("resolveModelRouting should surface bootstrap write failure as StartupValidationFailure naming the example path", async () => {
  const workspace = await makeSettingsWorkspace();
  const blockedHome = join(workspace.rootDirectory, "blocked-home");
  await writeFile(blockedHome, "not a directory");
  const expectedExamplePath = join(blockedHome, ".regentara", "models.yaml.example");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: blockedHome }),
    (error) =>
      error instanceof StartupValidationFailure
      && /failed to write example settings file/.test(error.message)
      && error.message.includes(expectedExamplePath),
  );
});

test("resolveModelRouting should not write models.yaml during bootstrap", async () => {
  const workspace = await makeSettingsWorkspace();
  const localPath = join(workspace.workingDirectory, ".regentara", "models.yaml");
  const globalPath = join(workspace.homeDirectory, ".regentara", "models.yaml");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await pathExists(localPath), false);
  assert.equal(await pathExists(globalPath), false);
});

test("resolveModelRouting should use local models yaml instead of global models yaml when both exist", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeGlobalSettings(workspace, "models.yaml", validModelsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    gpt: {
      model: "gpt-5.1-local",
      provider: "openai",
      runner: "codex",
    },
  }));

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(routing.routes.gpt.model, "gpt-5.1-local");
});

test("resolveModelRouting should fail before creating a run when local models yaml exists but is invalid", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeGlobalSettings(workspace, "models.yaml", validModelsYaml());
  await writeLocalSettings(workspace, "models.yaml", "routes: [");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );
});

for (const field of ["provider", "runner", "model"]) {
  test(`resolveModelRouting should reject route entries whose ${field} is not a string`, async () => {
    const workspace = await makeSettingsWorkspace();
    const route = { provider: "anthropic", runner: "claude-code", model: "claude-sonnet-4-5" };
    route[field] = ["not", "a", "string"];
    await writeLocalSettings(workspace, "models.yaml", validModelsYaml({ sonnet: route }));

    await assert.rejects(
      () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      new RegExp(`route sonnet field ${field} must be a non-empty string`),
    );
  });

  test(`resolveModelRouting should reject route entries whose ${field} is empty or whitespace`, async () => {
    const workspace = await makeSettingsWorkspace();
    const route = { provider: "anthropic", runner: "claude-code", model: "claude-sonnet-4-5" };
    route[field] = "   ";
    await writeLocalSettings(workspace, "models.yaml", validModelsYaml({ sonnet: route }));

    await assert.rejects(
      () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      new RegExp(`route sonnet field ${field} must be a non-empty string`),
    );
  });
}

test("resolveModelRouting should reject models yaml missing provider, runner, or model for a route key", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    sonnet: {
      model: "claude-sonnet-4-5",
      provider: "anthropic",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /route sonnet missing required field: runner/,
  );
});

test("resolveModelRouting should accept user-defined route keys outside the legacy MVP set", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    haiku: {
      model: "claude-haiku",
      provider: "anthropic",
      runner: "claude-code",
    },
  }));

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(routing.routes.haiku.model, "claude-haiku");
});

test("resolveModelRouting should accept arbitrary provider and runner strings", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    sonnet: {
      model: "claude-sonnet-4-5",
      provider: "custom-provider",
      runner: "custom-runner",
    },
  }));

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(routing.routes.sonnet.provider, "custom-provider");
  assert.equal(routing.routes.sonnet.runner, "custom-runner");
});
