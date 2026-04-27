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

test("resolveModelRouting should reject models yaml with an unknown route key", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    haiku: {
      model: "claude-haiku",
      provider: "anthropic",
      runner: "claude-code",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unknown route key: haiku/,
  );
});

for (const routeKey of ["sonnet", "opus", "gpt", "codex"]) {
  test(`resolveModelRouting should reject models yaml missing ${routeKey}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "models.yaml", validModelsYaml({ [routeKey]: undefined }));

    await assert.rejects(
      () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      new RegExp(`missing required route key: ${routeKey}`),
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

test("resolveModelRouting should reject models yaml with an unsupported provider", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    sonnet: {
      model: "claude-sonnet-4-5",
      provider: "custom",
      runner: "claude-code",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unsupported provider: custom/,
  );
});

test("resolveModelRouting should reject models yaml with an unsupported runner", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    sonnet: {
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      runner: "custom",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unsupported runner: custom/,
  );
});

test("resolveModelRouting should reject models yaml with an invalid provider runner combination", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    sonnet: {
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      runner: "codex",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unsupported provider\/runner combination: anthropic\/codex/,
  );
});
