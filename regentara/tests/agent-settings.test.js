import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { StartupValidationFailure } from "../src/errors.js";
import { resolveAgentSettings } from "../src/settings/agent-settings.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
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

test("resolveAgentSettings should fail before creating a run when neither local nor global agents yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );
});

test("resolveAgentSettings should write agents.yaml.example to the home directory when no agents.yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();
  const examplePath = join(workspace.homeDirectory, ".regentara", "agents.yaml.example");

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await pathExists(examplePath), true);
});

test("resolveAgentSettings should not overwrite an existing agents.yaml.example", async () => {
  const workspace = await makeSettingsWorkspace();
  const exampleDir = join(workspace.homeDirectory, ".regentara");
  const examplePath = join(exampleDir, "agents.yaml.example");
  await mkdir(exampleDir, { recursive: true });
  await writeFile(examplePath, "user-edited-example");

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await readFile(examplePath, "utf8"), "user-edited-example");
});

test("resolveAgentSettings should not write agents.yaml during bootstrap", async () => {
  const workspace = await makeSettingsWorkspace();
  const localPath = join(workspace.workingDirectory, ".regentara", "agents.yaml");
  const globalPath = join(workspace.homeDirectory, ".regentara", "agents.yaml");

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await pathExists(localPath), false);
  assert.equal(await pathExists(globalPath), false);
});

test("resolveAgentSettings should use local agents yaml instead of global agents yaml when both exist", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeGlobalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "opus",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "regentara://prompts/producer" },
    },
  }));

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(settings.agents.producer.model, "opus");
});

test("resolveAgentSettings should fail before creating a run when local agents yaml exists but is invalid", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeGlobalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "agents.yaml", "agents: [");

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );
});

test("resolveAgentSettings should reject agents yaml with an unknown agent identifier", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    observer: {
      model: "sonnet",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "regentara://prompts/producer" },
    },
  }));

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unknown agent: observer/,
  );
});

for (const agentId of ["producer", "reviewer", "remediator"]) {
  test(`resolveAgentSettings should reject agents yaml missing ${agentId}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({ [agentId]: undefined }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      new RegExp(`missing required agent: ${agentId}`),
    );
  });
}

for (const agentId of ["producer", "reviewer", "remediator"]) {
  test(`resolveAgentSettings should reject agents yaml missing model, prompt, or output for ${agentId}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      [agentId]: {
        model: "sonnet",
        prompt: { ref: `regentara://prompts/${agentId}` },
      },
    }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      new RegExp(`agent ${agentId} missing required field: output`),
    );
  });
}

test("resolveAgentSettings should accept arbitrary prompt reference strings", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "sonnet",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "custom://producer" },
    },
  }));

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(settings.agents.producer.prompt.ref, "custom://producer");
});

test("resolveAgentSettings should reject agents yaml with an unsupported output schema reference", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "sonnet",
      output: { schemaRef: "custom://producer" },
      prompt: { ref: "regentara://prompts/producer" },
    },
  }));

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unsupported output schema reference/,
  );
});

test("resolveAgentSettings should expose selected local settings path", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(settings.selectedPath, join(workspace.workingDirectory, ".regentara", "agents.yaml"));
});

test("resolveAgentSettings should resolve producer output schema ref to require an artifact", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(settings.agents.producer.outputSchema.required, ["artifact"]);
});

test("resolveAgentSettings should resolve reviewer output schema ref to require a verdict", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(settings.agents.reviewer.outputSchema.required, ["verdict"]);
});

test("resolveAgentSettings should resolve remediator output schema ref to require a task", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(settings.agents.remediator.outputSchema.required, ["task"]);
});
