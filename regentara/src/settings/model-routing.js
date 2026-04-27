import { readFile } from "node:fs/promises";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import { firstExistingSettingsPath } from "./paths.js";

const REQUIRED_ROUTE_KEYS = ["sonnet", "opus", "gpt", "codex"];
const REQUIRED_FIELDS = ["provider", "runner", "model"];
const SUPPORTED_COMBINATIONS = new Set([
  "anthropic/claude-code",
  "openai/codex",
]);

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

  const routeKeys = Object.keys(rawRoutes);
  const unknownRoute = routeKeys.find((routeKey) => !REQUIRED_ROUTE_KEYS.includes(routeKey));
  if (unknownRoute) {
    throw new StartupValidationFailure(`models.yaml contains unknown route key: ${unknownRoute}`);
  }

  const missingRoute = REQUIRED_ROUTE_KEYS.find((routeKey) => !routeKeys.includes(routeKey));
  if (missingRoute) {
    throw new StartupValidationFailure(`models.yaml missing required route key: ${missingRoute}`);
  }

  const routes = {};
  for (const routeKey of REQUIRED_ROUTE_KEYS) {
    routes[routeKey] = validateRoute(routeKey, rawRoutes[routeKey]);
  }

  return {
    selectedPath,
    routes,
  };
}

export function requiredRouteKeys() {
  return [...REQUIRED_ROUTE_KEYS];
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

  if (!["anthropic", "openai"].includes(rawRoute.provider)) {
    throw new StartupValidationFailure(`unsupported provider: ${rawRoute.provider}`);
  }

  if (!["claude-code", "codex"].includes(rawRoute.runner)) {
    throw new StartupValidationFailure(`unsupported runner: ${rawRoute.runner}`);
  }

  const combination = `${rawRoute.provider}/${rawRoute.runner}`;
  if (!SUPPORTED_COMBINATIONS.has(combination)) {
    throw new StartupValidationFailure(`unsupported provider/runner combination: ${combination}`);
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
