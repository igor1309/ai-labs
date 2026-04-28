import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import { firstExistingSettingsPath } from "./paths.js";

const AGENTS_YAML_EXAMPLE = `agents:
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

const REQUIRED_AGENTS = ["producer", "reviewer", "remediator"];
const REQUIRED_FIELDS = ["model", "prompt", "output"];

const SUPPORTED_SCHEMA_REFS = new Map([
  [
    "regentara://schemas/producer-output",
    {
      required: ["artifact"],
      type: "object",
    },
  ],
  [
    "regentara://schemas/reviewer-output",
    {
      required: ["verdict"],
      type: "object",
    },
  ],
  [
    "regentara://schemas/remediator-output",
    {
      required: ["task"],
      type: "object",
    },
  ],
]);

export async function resolveAgentSettings(workingDirectory, options = {}) {
  const selectedPath = await firstExistingSettingsPath(
    workingDirectory,
    "agents.yaml",
    options,
  );

  if (!selectedPath) {
    await writeExampleIfMissing(options);
    throw new StartupValidationFailure("agents.yaml not found");
  }

  const document = await loadYamlDocument(selectedPath, "agents.yaml");
  const rawAgents = document.agents;

  if (!isPlainObject(rawAgents)) {
    throw new StartupValidationFailure("agents.yaml must define agents");
  }

  const agentIds = Object.keys(rawAgents);
  const unknownAgent = agentIds.find((agentId) => !REQUIRED_AGENTS.includes(agentId));
  if (unknownAgent) {
    throw new StartupValidationFailure(`agents.yaml contains unknown agent: ${unknownAgent}`);
  }

  const missingAgent = REQUIRED_AGENTS.find((agentId) => !agentIds.includes(agentId));
  if (missingAgent) {
    throw new StartupValidationFailure(`agents.yaml missing required agent: ${missingAgent}`);
  }

  const agents = {};
  for (const agentId of REQUIRED_AGENTS) {
    agents[agentId] = validateAgent(agentId, rawAgents[agentId]);
  }

  return {
    selectedPath,
    agents,
  };
}

export function requiredAgentIds() {
  return [...REQUIRED_AGENTS];
}

async function loadYamlDocument(path, fileName) {
  let parsed;

  try {
    parsed = yaml.load(await readFile(path, "utf8"));
  } catch (error) {
    throw new StartupValidationFailure(`${fileName} is invalid`, { cause: error });
  }

  if (!isPlainObject(parsed)) {
    throw new StartupValidationFailure(`${fileName} must be a mapping`);
  }

  return parsed;
}

function validateAgent(agentId, rawAgent) {
  if (!isPlainObject(rawAgent)) {
    throw new StartupValidationFailure(`agents.yaml agent ${agentId} must be a mapping`);
  }

  const missingField = REQUIRED_FIELDS.find((field) => rawAgent[field] === undefined);
  if (missingField) {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} missing required field: ${missingField}`,
    );
  }

  const prompt = validatePrompt(rawAgent.prompt);
  const outputSchema = validateOutput(rawAgent.output);

  return {
    model: rawAgent.model,
    name: rawAgent.name,
    prompt,
    outputSchema,
  };
}

function validatePrompt(prompt) {
  if (!isPlainObject(prompt) || typeof prompt.ref !== "string") {
    throw new StartupValidationFailure("agents.yaml prompt must define a string ref");
  }

  return { ref: prompt.ref };
}

function validateOutput(output) {
  if (!isPlainObject(output)) {
    throw new StartupValidationFailure("agents.yaml output must be a mapping");
  }

  if (isPlainObject(output.schema)) {
    return output.schema;
  }

  if (typeof output.schemaRef === "string" && SUPPORTED_SCHEMA_REFS.has(output.schemaRef)) {
    return SUPPORTED_SCHEMA_REFS.get(output.schemaRef);
  }

  throw new StartupValidationFailure("unsupported output schema reference");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function writeExampleIfMissing(options) {
  const homeDirectory = options.homeDirectory ?? homedir();
  const examplePath = join(homeDirectory, ".regentara", "agents.yaml.example");

  try {
    await readFile(examplePath);
    return;
  } catch {}

  await mkdir(dirname(examplePath), { recursive: true });
  await writeFile(examplePath, AGENTS_YAML_EXAMPLE, { flag: "wx" });
}
