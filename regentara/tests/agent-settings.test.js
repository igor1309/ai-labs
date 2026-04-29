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
  const examplePath = join(workspace.homeDirectory, ".regentara", "agents.yaml.example");

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    (error) =>
      error instanceof StartupValidationFailure
      && error.message.includes("agents.yaml not found")
      && error.message.includes(examplePath),
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

test("resolveAgentSettings should surface bootstrap write failure as StartupValidationFailure naming the example path", async () => {
  const workspace = await makeSettingsWorkspace();
  const blockedHome = join(workspace.rootDirectory, "blocked-home");
  await writeFile(blockedHome, "not a directory");
  const expectedExamplePath = join(blockedHome, ".regentara", "agents.yaml.example");

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: blockedHome }),
    (error) =>
      error instanceof StartupValidationFailure
      && /failed to write example settings file/.test(error.message)
      && error.message.includes(expectedExamplePath),
  );
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
      provider: "anthropic",
    },
  }));

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(settings.agents.producer.model, "opus");
});

test("resolveAgentSettings should resolve provider and model tier for agents", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    reviewer: {
      model: "high",
      output: { schemaRef: "regentara://schemas/reviewer-output" },
      prompt: { ref: "regentara://prompts/reviewer" },
      provider: "openai",
    },
  }));

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(
    {
      model: settings.agents.reviewer.model,
      provider: settings.agents.reviewer.provider,
    },
    {
      model: "high",
      provider: "openai",
    },
  );
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
      provider: "anthropic",
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
  test(`resolveAgentSettings should reject agents yaml missing provider, model, prompt, or output for ${agentId}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      [agentId]: {
        model: "medium",
        prompt: { ref: `regentara://prompts/${agentId}` },
        provider: "anthropic",
      },
    }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      new RegExp(`agent ${agentId} missing required field: output`),
    );
  });
}

test("resolveAgentSettings should reject agents yaml missing provider for producer", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "medium",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "regentara://prompts/producer" },
    },
  }));

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /agent producer missing required field: provider/,
  );
});

for (const [label, value] of [
  ["array", ["anthropic"]],
  ["object", { name: "anthropic" }],
  ["whitespace", "   "],
]) {
  test(`resolveAgentSettings should reject agents whose provider field is ${label}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      producer: {
        model: "medium",
        output: { schemaRef: "regentara://schemas/producer-output" },
        prompt: { ref: "regentara://prompts/producer" },
        provider: value,
      },
    }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      /agents\.yaml agent producer field provider must be a non-empty string/,
    );
  });
}

for (const [label, value] of [
  ["array", ["sonnet"]],
  ["object", { name: "sonnet" }],
  ["whitespace", "   "],
]) {
  test(`resolveAgentSettings should reject agents whose model field is ${label}`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      producer: {
        model: value,
        output: { schemaRef: "regentara://schemas/producer-output" },
        prompt: { ref: "regentara://prompts/producer" },
        provider: "anthropic",
      },
    }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      /agents\.yaml agent producer field model must be a non-empty string/,
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
      provider: "anthropic",
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
      provider: "anthropic",
    },
  }));

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    (error) =>
      error instanceof StartupValidationFailure
      && /agents\.yaml/.test(error.message)
      && /custom:\/\/producer/.test(error.message),
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

test("resolveAgentSettings should resolve producer output schema ref to require an artifact and verification", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(settings.agents.producer.outputSchema.required, ["artifact", "verification"]);
});

test("resolveAgentSettings should resolve reviewer output schema ref to require a verdict, verification, and summary", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(
    settings.agents.reviewer.outputSchema.required,
    ["verdict", "verification", "summary"],
  );
  assert.deepEqual(
    settings.agents.reviewer.outputSchema.properties.summary,
    { type: "string", minLength: 1 },
  );
});

test("resolveAgentSettings should resolve remediator output schema ref to require a task", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(settings.agents.remediator.outputSchema.required, ["task"]);
});

for (const agentId of ["producer", "reviewer"]) {
  test(`resolveAgentSettings should reject ${agentId} inline schema that does not require verification`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      [agentId]: {
        model: agentId === "producer" ? "medium" : "high",
        output: {
          schema: {
            type: "object",
            required: [agentId === "producer" ? "artifact" : "verdict"],
            properties: {
              [agentId === "producer" ? "artifact" : "verdict"]: { type: "string" },
            },
          },
        },
        prompt: { ref: `regentara://prompts/${agentId}` },
        provider: "anthropic",
      },
    }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      (error) =>
        error instanceof StartupValidationFailure
        && error.message.includes(agentId)
        && error.message.includes("verification"),
    );
  });

  test(`resolveAgentSettings should reject ${agentId} inline schema that requires verification but not verification.ran`, async () => {
    const workspace = await makeSettingsWorkspace();
    const semanticField = agentId === "producer" ? "artifact" : "verdict";
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      [agentId]: {
        model: agentId === "producer" ? "medium" : "high",
        output: {
          schema: {
            type: "object",
            required: [semanticField, "verification"],
            properties: {
              [semanticField]: { type: "string" },
              verification: { type: "object" },
            },
          },
        },
        prompt: { ref: `regentara://prompts/${agentId}` },
        provider: "anthropic",
      },
    }));

    await assert.rejects(
      () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      (error) =>
        error instanceof StartupValidationFailure
        && error.message.includes(agentId)
        && error.message.includes("verification.ran"),
    );
  });

  test(`resolveAgentSettings should accept ${agentId} inline schema that requires verification.ran`, async () => {
    const workspace = await makeSettingsWorkspace();
    const semanticField = agentId === "producer" ? "artifact" : "verdict";
    const required = agentId === "reviewer"
      ? [semanticField, "verification", "summary"]
      : [semanticField, "verification"];
    const properties = {
      [semanticField]: { type: "string" },
      verification: {
        type: "object",
        required: ["ran"],
        properties: {
          ran: { type: "boolean" },
        },
      },
      ...(agentId === "reviewer" ? { summary: { type: "string", minLength: 1 } } : {}),
    };
    await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
      [agentId]: {
        model: agentId === "producer" ? "medium" : "high",
        output: {
          schema: {
            type: "object",
            required,
            properties,
          },
        },
        prompt: { ref: `regentara://prompts/${agentId}` },
        provider: "anthropic",
      },
    }));

    const settings = await resolveAgentSettings(workspace.workingDirectory, {
      homeDirectory: workspace.homeDirectory,
    });

    assert.deepEqual(settings.agents[agentId].outputSchema.required, required);
  });
}

test("resolveAgentSettings should reject reviewer inline schema that does not require summary", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    reviewer: {
      model: "high",
      output: {
        schema: {
          type: "object",
          required: ["verdict", "verification"],
          properties: {
            verdict: { type: "string" },
            verification: {
              type: "object",
              required: ["ran"],
              properties: { ran: { type: "boolean" } },
            },
          },
        },
      },
      prompt: { ref: "regentara://prompts/reviewer" },
      provider: "openai",
    },
  }));

  await assert.rejects(
    () => resolveAgentSettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    (error) =>
      error instanceof StartupValidationFailure
      && error.message.includes("reviewer")
      && error.message.includes("summary"),
  );
});

test("resolveAgentSettings should accept reviewer inline schema that requires summary as a string", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    reviewer: {
      model: "high",
      output: {
        schema: {
          type: "object",
          required: ["verdict", "verification", "summary"],
          properties: {
            verdict: { type: "string" },
            summary: { type: "string", minLength: 1 },
            verification: {
              type: "object",
              required: ["ran"],
              properties: { ran: { type: "boolean" } },
            },
          },
        },
      },
      prompt: { ref: "regentara://prompts/reviewer" },
      provider: "openai",
    },
  }));

  const settings = await resolveAgentSettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(
    settings.agents.reviewer.outputSchema.required,
    ["verdict", "verification", "summary"],
  );
});
