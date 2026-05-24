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
  const examplePath = join(workspace.homeDirectory, ".reinix", "models.yaml.example");

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
  const examplePath = join(workspace.homeDirectory, ".reinix", "models.yaml.example");

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await pathExists(examplePath), true);
});

test("resolveModelRouting should not overwrite an existing models.yaml.example", async () => {
  const workspace = await makeSettingsWorkspace();
  const exampleDir = join(workspace.homeDirectory, ".reinix");
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
  const expectedExamplePath = join(blockedHome, ".reinix", "models.yaml.example");

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
  const localPath = join(workspace.workingDirectory, ".reinix", "models.yaml");
  const globalPath = join(workspace.homeDirectory, ".reinix", "models.yaml");

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
    openai: {
      runner: "codex",
      models: {
        high: {
          model: "gpt-5.1-local",
          reasoningEffort: "high",
        },
      },
    },
  }));

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(routing.providers.openai.models.high.model, "gpt-5.1-local");
});

test("resolveModelRouting should resolve provider model tiers", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", `
providers:
  openai:
    runner: codex
    models:
      medium:
        model: gpt-5.5
        reasoningEffort: medium
      high:
        model: gpt-5.5
        reasoningEffort: high
  anthropic:
    runner: claude-code
    models:
      high:
        model: claude-opus-4-7
`);

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(routing.providers.openai.models.medium, {
    model: "gpt-5.5",
    reasoningEffort: "medium",
  });
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

test("resolveModelRouting should reject models yaml missing providers", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", `
routes:
  sonnet:
    provider: anthropic
    runner: claude-code
    model: claude-sonnet-4-5
`);

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /models.yaml must define providers/,
  );
});

for (const value of [["not", "a", "string"], "   "]) {
  test(`resolveModelRouting should reject provider runner value ${JSON.stringify(value)}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
      anthropic: {
        models: {
          medium: {
            model: "claude-sonnet-4-5",
          },
        },
        runner: value,
      },
    }));

    await assert.rejects(
      () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      /provider anthropic field runner must be a non-empty string/,
    );
  });
}

test("resolveModelRouting should reject provider entries whose models is not a mapping", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    anthropic: {
      models: ["not", "a", "mapping"],
      runner: "claude-code",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /provider anthropic models must be a mapping/,
  );
});

for (const value of [["not", "a", "string"], "   "]) {
  test(`resolveModelRouting should reject model tier model value ${JSON.stringify(value)}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
      anthropic: {
        models: {
          medium: {
            model: value,
          },
        },
        runner: "claude-code",
      },
    }));

    await assert.rejects(
      () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      /provider anthropic model medium field model must be a non-empty string/,
    );
  });
}

for (const value of [["not", "a", "string"], "   "]) {
  test(`resolveModelRouting should reject model tier reasoningEffort value ${JSON.stringify(value)}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
      openai: {
        models: {
          high: {
            model: "gpt-5.5",
            reasoningEffort: value,
          },
        },
        runner: "codex",
      },
    }));

    await assert.rejects(
      () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      /provider openai model high field reasoningEffort must be a non-empty string/,
    );
  });
}

test("resolveModelRouting should reject provider entries missing runner", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    anthropic: {
      models: {
        medium: {
          model: "claude-sonnet-4-5",
        },
      },
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /provider anthropic missing required field: runner/,
  );
});

test("resolveModelRouting should reject model tier entries missing model", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    anthropic: {
      models: {
        medium: {
          reasoningEffort: "medium",
        },
      },
      runner: "claude-code",
    },
  }));

  await assert.rejects(
    () => resolveModelRouting(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /provider anthropic model medium missing required field: model/,
  );
});

test("resolveModelRouting should accept user-defined model tiers outside the default set", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    anthropic: {
      runner: "claude-code",
      models: {
        fast: {
          model: "claude-haiku",
        },
      },
    },
  }));

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(routing.providers.anthropic.models.fast.model, "claude-haiku");
});

test("resolveModelRouting should accept arbitrary provider and runner strings", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    experimental: {
      runner: "custom-runner",
      models: {
        medium: {
          model: "x-model",
        },
      },
    },
  }));

  const routing = await resolveModelRouting(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(routing.providers.experimental.runner, "custom-runner");
  assert.equal(routing.providers.experimental.models.medium.model, "x-model");
});
