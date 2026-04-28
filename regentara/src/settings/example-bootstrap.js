import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { firstExistingSettingsPath } from "./paths.js";

export const AGENTS_YAML_EXAMPLE = `agents:
  producer:
    model: sonnet
    prompt:
      ref: regentara://prompts/producer
    output:
      schemaRef: regentara://schemas/producer-output
  reviewer:
    model: sonnet
    prompt:
      ref: regentara://prompts/reviewer
    output:
      schemaRef: regentara://schemas/reviewer-output
  remediator:
    model: sonnet
    prompt:
      ref: regentara://prompts/remediator
    output:
      schemaRef: regentara://schemas/remediator-output
`;

export const MODELS_YAML_EXAMPLE = `routes:
  sonnet:
    provider: anthropic
    runner: claude-code
    model: claude-sonnet-4-5
  opus:
    provider: anthropic
    runner: claude-code
    model: claude-opus-4-7
  gpt:
    provider: openai
    runner: codex
    model: gpt-5.1-codex
  codex:
    provider: openai
    runner: codex
    model: gpt-5.1-codex
`;

const SETTINGS_FILES = [
  { source: "agents.yaml", example: "agents.yaml.example", content: AGENTS_YAML_EXAMPLE },
  { source: "models.yaml", example: "models.yaml.example", content: MODELS_YAML_EXAMPLE },
];

export function settingsExamplePath(options, fileName) {
  const homeDirectory = options.homeDirectory ?? homedir();
  return join(homeDirectory, ".regentara", fileName);
}

export async function writeSettingsExample(options, fileName, content) {
  const examplePath = settingsExamplePath(options, fileName);

  try {
    await mkdir(dirname(examplePath), { recursive: true });
    await writeFile(examplePath, content, { flag: "wx" });
  } catch {}
}

export async function bootstrapMissingSettings(workingDirectory, options = {}) {
  for (const { source, example, content } of SETTINGS_FILES) {
    if (!(await firstExistingSettingsPath(workingDirectory, source, options))) {
      await writeSettingsExample(options, example, content);
    }
  }
}
