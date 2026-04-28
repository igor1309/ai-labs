import { readFile } from "node:fs/promises";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import {
  MODELS_YAML_EXAMPLE,
  settingsExamplePath,
  writeSettingsExample,
} from "./example-bootstrap.js";
import { firstExistingSettingsPath } from "./paths.js";

const REQUIRED_PROVIDER_FIELDS = ["runner", "models"];
const REQUIRED_MODEL_FIELDS = ["model"];

export async function resolveModelRouting(workingDirectory, options = {}) {
  const selectedPath = await firstExistingSettingsPath(
    workingDirectory,
    "models.yaml",
    options,
  );

  if (!selectedPath) {
    await writeSettingsExample(options, "models.yaml.example", MODELS_YAML_EXAMPLE);
    const examplePath = settingsExamplePath(options, "models.yaml.example");
    throw new StartupValidationFailure(`models.yaml not found; see ${examplePath}`);
  }

  const document = await loadYamlDocument(selectedPath, "models.yaml");
  if (!isPlainObject(document.providers)) {
    throw new StartupValidationFailure("models.yaml must define providers");
  }

  const providers = {};
  for (const provider of Object.keys(document.providers)) {
    providers[provider] = validateProvider(provider, document.providers[provider]);
  }

  return {
    selectedPath,
    providers,
  };
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

function validateProvider(provider, rawProvider) {
  if (!isPlainObject(rawProvider)) {
    throw new StartupValidationFailure(`models.yaml provider ${provider} must be a mapping`);
  }

  const missingField = REQUIRED_PROVIDER_FIELDS.find((field) => rawProvider[field] === undefined);
  if (missingField) {
    throw new StartupValidationFailure(
      `models.yaml provider ${provider} missing required field: ${missingField}`,
    );
  }

  if (typeof rawProvider.runner !== "string" || rawProvider.runner.trim() === "") {
    throw new StartupValidationFailure(
      `models.yaml provider ${provider} field runner must be a non-empty string`,
    );
  }

  if (!isPlainObject(rawProvider.models)) {
    throw new StartupValidationFailure(`models.yaml provider ${provider} models must be a mapping`);
  }

  const models = {};
  for (const tier of Object.keys(rawProvider.models)) {
    models[tier] = validateProviderModel(provider, tier, rawProvider.models[tier]);
  }

  return {
    models,
    runner: rawProvider.runner.trim(),
  };
}

function validateProviderModel(provider, tier, rawModel) {
  if (!isPlainObject(rawModel)) {
    throw new StartupValidationFailure(`models.yaml provider ${provider} model ${tier} must be a mapping`);
  }

  const missingField = REQUIRED_MODEL_FIELDS.find((field) => rawModel[field] === undefined);
  if (missingField) {
    throw new StartupValidationFailure(
      `models.yaml provider ${provider} model ${tier} missing required field: ${missingField}`,
    );
  }

  if (typeof rawModel.model !== "string" || rawModel.model.trim() === "") {
    throw new StartupValidationFailure(
      `models.yaml provider ${provider} model ${tier} field model must be a non-empty string`,
    );
  }

  if (rawModel.reasoningEffort !== undefined
    && (typeof rawModel.reasoningEffort !== "string" || rawModel.reasoningEffort.trim() === "")) {
    throw new StartupValidationFailure(
      `models.yaml provider ${provider} model ${tier} field reasoningEffort must be a non-empty string`,
    );
  }

  return {
    model: rawModel.model.trim(),
    ...(rawModel.reasoningEffort ? { reasoningEffort: rawModel.reasoningEffort.trim() } : {}),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
