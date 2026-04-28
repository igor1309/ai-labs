import { readFile } from "node:fs/promises";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import {
  MODELS_YAML_EXAMPLE,
  settingsExamplePath,
  writeSettingsExample,
} from "./example-bootstrap.js";
import { firstExistingSettingsPath } from "./paths.js";

const REQUIRED_FIELDS = ["provider", "runner", "model"];

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
  const rawRoutes = document.routes;

  if (!isPlainObject(rawRoutes)) {
    throw new StartupValidationFailure("models.yaml must define routes");
  }

  const routes = {};
  for (const routeKey of Object.keys(rawRoutes)) {
    routes[routeKey] = validateRoute(routeKey, rawRoutes[routeKey]);
  }

  return {
    selectedPath,
    routes,
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

function validateRoute(routeKey, rawRoute) {
  if (!isPlainObject(rawRoute)) {
    throw new StartupValidationFailure(`models.yaml route ${routeKey} must be a mapping`);
  }

  const missingField = REQUIRED_FIELDS.find((field) => rawRoute[field] === undefined);
  if (missingField) {
    throw new StartupValidationFailure(
      `models.yaml route ${routeKey} missing required field: ${missingField}`,
    );
  }

  const invalidField = REQUIRED_FIELDS.find(
    (field) => typeof rawRoute[field] !== "string" || rawRoute[field].trim() === "",
  );
  if (invalidField) {
    throw new StartupValidationFailure(
      `models.yaml route ${routeKey} field ${invalidField} must be a non-empty string`,
    );
  }

  return {
    model: rawRoute.model.trim(),
    provider: rawRoute.provider.trim(),
    runner: rawRoute.runner.trim(),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
