import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { StartupValidationFailure } from "../errors.js";
import { firstExistingSettingsPath } from "./paths.js";

export const AGENTS_YAML_EXAMPLE = `agents:
  producer:
    provider: anthropic
    model: medium
    prompt:
      ref: reinix://prompts/producer
    output:
      schemaRef: reinix://schemas/producer-output
  reviewer:
    provider: openai
    model: high
    prompt:
      ref: reinix://prompts/reviewer
    output:
      schemaRef: reinix://schemas/reviewer-output
  remediator:
    provider: anthropic
    model: high
    prompt:
      ref: reinix://prompts/remediator
    output:
      schemaRef: reinix://schemas/remediator-output
`;

export const MODELS_YAML_EXAMPLE = `providers:
  anthropic:
    runner: claude-code
    models:
      medium:
        model: claude-sonnet-4-5
      high:
        model: claude-opus-4-7
  openai:
    runner: codex
    models:
      medium:
        model: gpt-5.5
        reasoningEffort: medium
      high:
        model: gpt-5.5
        reasoningEffort: high
`;

const SETTINGS_FILES = [
  { source: "agents.yaml", example: "agents.yaml.example", content: AGENTS_YAML_EXAMPLE },
  { source: "models.yaml", example: "models.yaml.example", content: MODELS_YAML_EXAMPLE },
];

export function settingsExamplePath(options, fileName) {
  const homeDirectory = options.homeDirectory ?? homedir();
  return join(homeDirectory, ".reinix", fileName);
}

export async function writeSettingsExample(options, fileName, content) {
  const examplePath = settingsExamplePath(options, fileName);

  try {
    await mkdir(dirname(examplePath), { recursive: true });
    await writeFile(examplePath, content, { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return;
    throw new StartupValidationFailure(
      `failed to write example settings file: ${examplePath}`,
      { cause: error },
    );
  }
}

export async function bootstrapMissingSettings(workingDirectory, options = {}) {
  for (const { source, example, content } of SETTINGS_FILES) {
    if (!(await firstExistingSettingsPath(workingDirectory, source, options))) {
      await writeSettingsExample(options, example, content);
    }
  }
}
