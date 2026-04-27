import assert from "node:assert/strict";
import test from "node:test";

import { StartupValidationFailure } from "../src/errors.js";
import { resolveModelRouting } from "../src/settings/model-routing.js";
import {
  makeSettingsWorkspace,
  validModelsYaml,
  writeGlobalSettings,
  writeLocalSettings,
} from "./helpers/settings.js";

test("resolveModelRouting should fail before creating a run when neither local nor global models yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );
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
