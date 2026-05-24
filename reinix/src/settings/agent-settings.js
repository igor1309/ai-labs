import { readFile } from "node:fs/promises";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import {
  AGENTS_YAML_EXAMPLE,
  settingsExamplePath,
  writeSettingsExample,
} from "./example-bootstrap.js";
import { firstExistingSettingsPath } from "./paths.js";

const REQUIRED_AGENTS = ["producer", "reviewer", "remediator"];
const REQUIRED_FIELDS = ["model", "provider", "prompt", "output"];

const VERIFICATION_SCHEMA = {
  type: "object",
  required: ["ran"],
  properties: {
    ran: { type: "boolean" },
    command: { type: "string" },
    exitCode: { type: "integer" },
  },
};

const SUPPORTED_SCHEMA_REFS = new Map([
  [
    "reinix://schemas/producer-output",
    {
      required: ["artifact", "verification"],
      type: "object",
      properties: {
        verification: VERIFICATION_SCHEMA,
      },
    },
  ],
  [
    "reinix://schemas/reviewer-output",
    {
      required: ["verdict", "verification", "summary"],
      type: "object",
      properties: {
        summary: { type: "string", minLength: 1 },
        verification: VERIFICATION_SCHEMA,
      },
    },
  ],
  [
    "reinix://schemas/remediator-output",
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
    await writeSettingsExample(options, "agents.yaml.example", AGENTS_YAML_EXAMPLE);
    const examplePath = settingsExamplePath(options, "agents.yaml.example");
    throw new StartupValidationFailure(`agents.yaml not found; see ${examplePath}`);
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
    assertVerificationContract(agentId, agents[agentId].outputSchema);
    assertReviewerSummaryContract(agentId, agents[agentId].outputSchema);
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

  if (typeof rawAgent.model !== "string" || rawAgent.model.trim() === "") {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} field model must be a non-empty string`,
    );
  }

  if (typeof rawAgent.provider !== "string" || rawAgent.provider.trim() === "") {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} field provider must be a non-empty string`,
    );
  }

  const prompt = validatePrompt(rawAgent.prompt);
  const outputSchema = validateOutput(rawAgent.output);

  return {
    model: rawAgent.model.trim(),
    name: rawAgent.name,
    prompt,
    provider: rawAgent.provider.trim(),
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

  throw new StartupValidationFailure(
    `agents.yaml unsupported output schema reference: ${output.schemaRef ?? "(missing)"}`,
  );
}

const VERIFICATION_GATED_AGENTS = new Set(["producer", "reviewer"]);

function assertVerificationContract(agentId, outputSchema) {
  if (!VERIFICATION_GATED_AGENTS.has(agentId)) {
    return;
  }

  const recommendation = `set output.schemaRef to reinix://schemas/${agentId}-output, or include verification.ran (boolean) as required in the inline schema`;
  const required = Array.isArray(outputSchema?.required) ? outputSchema.required : [];

  if (!required.includes("verification")) {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} output schema must require verification; ${recommendation}`,
    );
  }

  const verificationSchema = outputSchema?.properties?.verification;
  const verificationRequired = Array.isArray(verificationSchema?.required) ? verificationSchema.required : [];

  if (!verificationRequired.includes("ran")) {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} output schema must require verification.ran; ${recommendation}`,
    );
  }
}

function assertReviewerSummaryContract(agentId, outputSchema) {
  if (agentId !== "reviewer") {
    return;
  }

  const recommendation = "set output.schemaRef to reinix://schemas/reviewer-output, or include summary (string) as required in the inline schema";
  const required = Array.isArray(outputSchema?.required) ? outputSchema.required : [];

  if (!required.includes("summary")) {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} output schema must require summary; ${recommendation}`,
    );
  }

  const summarySchema = outputSchema?.properties?.summary;
  if (summarySchema?.type !== "string") {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} output schema must declare summary as a string; ${recommendation}`,
    );
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
