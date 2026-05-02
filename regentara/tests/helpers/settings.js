import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function makeSettingsWorkspace() {
  const rootDirectory = await mkdtemp(join(tmpdir(), "regentara-settings-"));
  const workingDirectory = join(rootDirectory, "work");
  const homeDirectory = join(rootDirectory, "home");

  await mkdir(workingDirectory, { recursive: true });
  await mkdir(homeDirectory, { recursive: true });

  return {
    homeDirectory,
    rootDirectory,
    workingDirectory,
  };
}

export async function writeLocalSettings(workspace, fileName, content) {
  return writeSettings(join(workspace.workingDirectory, ".regentara"), fileName, content);
}

export async function writeGlobalSettings(workspace, fileName, content) {
  return writeSettings(join(workspace.homeDirectory, ".regentara"), fileName, content);
}

export function validAgentsYaml(overrides = {}) {
  const agents = {
    producer: makeAgent("producer"),
    reviewer: makeAgent("reviewer"),
    remediator: makeAgent("remediator"),
    ...overrides,
  };

  return yaml({
    agents,
  });
}

export function validModelsYaml(overrides = {}) {
  const providers = {
    anthropic: makeAnthropicProvider(),
    openai: makeOpenAiProvider(),
    ...overrides,
  };

  return yaml({
    providers,
  });
}

async function writeSettings(directory, fileName, content) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, fileName), content);
}

function makeAgent(agentId) {
  return {
    model: agentId === "producer" ? "medium" : "high",
    output: {
      schemaRef: `regentara://schemas/${agentId}-output`,
    },
    prompt: {
      ref: `regentara://prompts/${agentId}`,
    },
    provider: agentId === "reviewer" ? "openai" : "anthropic",
  };
}

function makeAnthropicProvider() {
  return {
    models: {
      high: {
        model: "claude-opus-4-7",
      },
      medium: {
        model: "claude-sonnet-4-5",
      },
    },
    runner: "claude-code",
  };
}

function makeOpenAiProvider() {
  return {
    models: {
      high: {
        model: "gpt-5.5",
        reasoningEffort: "high",
      },
      medium: {
        model: "gpt-5.5",
        reasoningEffort: "medium",
      },
    },
    runner: "codex",
  };
}

function yaml(value, indentation = 0) {
  if (Array.isArray(value)) {
    return value.map((item) => `${" ".repeat(indentation)}- ${yaml(item, indentation + 2).trimStart()}`).join("\n");
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .map(([key, nestedValue]) => {
        if (nestedValue !== null && typeof nestedValue === "object") {
          return `${" ".repeat(indentation)}${key}:\n${yaml(nestedValue, indentation + 2)}`;
        }

        return `${" ".repeat(indentation)}${key}: ${String(nestedValue)}`;
      })
      .join("\n");
  }

  return `${" ".repeat(indentation)}${String(value)}`;
}
