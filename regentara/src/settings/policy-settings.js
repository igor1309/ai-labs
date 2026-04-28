import { readFile } from "node:fs/promises";

import yaml from "js-yaml";

import { StartupValidationFailure } from "../errors.js";
import {
  settingsExamplePath,
  writeSettingsExample,
} from "./example-bootstrap.js";
import { firstExistingSettingsPath } from "./paths.js";

export const POLICY_YAML_EXAMPLE = `reviewPolicy:
  maxRemediationAttempts: 5
`;

export async function resolvePolicySettings(workingDirectory, options = {}) {
  const selectedPath = await firstExistingSettingsPath(
    workingDirectory,
    "policy.yaml",
    options,
  );

  if (!selectedPath) {
    await writeSettingsExample(options, "policy.yaml.example", POLICY_YAML_EXAMPLE);
    const examplePath = settingsExamplePath(options, "policy.yaml.example");
    throw new StartupValidationFailure(`policy.yaml not found; see ${examplePath}`);
  }

  const document = await loadYamlDocument(selectedPath, "policy.yaml");
  const reviewPolicy = validateReviewPolicy(document.reviewPolicy);

  return {
    reviewPolicy,
    selectedPath,
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

function validateReviewPolicy(reviewPolicy) {
  if (!isPlainObject(reviewPolicy)) {
    throw new StartupValidationFailure("policy.yaml must define reviewPolicy");
  }

  if (reviewPolicy.maxRemediationAttempts === undefined) {
    throw new StartupValidationFailure(
      "policy.yaml reviewPolicy missing required field: maxRemediationAttempts",
    );
  }

  if (
    !Number.isInteger(reviewPolicy.maxRemediationAttempts)
    || reviewPolicy.maxRemediationAttempts < 0
  ) {
    throw new StartupValidationFailure(
      "policy.yaml reviewPolicy maxRemediationAttempts must be a non-negative integer",
    );
  }

  return {
    maxRemediationAttempts: reviewPolicy.maxRemediationAttempts,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
