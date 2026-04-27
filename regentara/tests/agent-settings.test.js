import assert from "node:assert/strict";
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

test("resolveAgentSettings should fail before creating a run when neither local nor global agents yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );
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

test("resolveAgentSettings should reject agents yaml with an unsupported prompt reference", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "sonnet",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "custom://producer" },
    },
  }));

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /unsupported prompt reference/,
  );
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
