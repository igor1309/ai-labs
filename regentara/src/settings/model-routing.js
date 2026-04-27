import { readFile } from "node:fs/promises";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import { firstExistingSettingsPath } from "./paths.js";

const REQUIRED_FIELDS = ["provider", "runner", "model"];

export async function resolveModelRouting(workingDirectory, options = {}) {
  const selectedPath = await firstExistingSettingsPath(
    workingDirectory,
    "models.yaml",
    options,
  );

  if (!selectedPath) {
    throw new StartupValidationFailure("models.yaml not found");
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

  return {
    model: rawRoute.model,
    provider: rawRoute.provider,
    runner: rawRoute.runner,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
