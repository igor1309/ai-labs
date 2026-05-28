import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { StartupValidationFailure } from "../src/errors.js";
import { resolvePolicySettings } from "../src/settings/policy-settings.js";
import {
  makeSettingsWorkspace,
  writeGlobalSettings,
  writeLocalSettings,
} from "./helpers/settings.js";

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

test("resolvePolicySettings should write policy.yaml.example when no policy settings exist", async () => {
  const workspace = await makeSettingsWorkspace();
  const examplePath = join(workspace.homeDirectory, ".reinix", "policy.yaml.example");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await pathExists(examplePath), true);
});

test("resolvePolicySettings should not overwrite existing policy.yaml.example", async () => {
  const workspace = await makeSettingsWorkspace();
  const exampleDir = join(workspace.homeDirectory, ".reinix");
  const examplePath = join(exampleDir, "policy.yaml.example");
  await mkdir(exampleDir, { recursive: true });
  await writeFile(examplePath, "user-edited-example");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.equal(await readFile(examplePath, "utf8"), "user-edited-example");
});

test("resolvePolicySettings should not create active policy.yaml during bootstrap", async () => {
  const workspace = await makeSettingsWorkspace();
  const localPath = join(workspace.workingDirectory, ".reinix", "policy.yaml");
  const globalPath = join(workspace.homeDirectory, ".reinix", "policy.yaml");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    StartupValidationFailure,
  );

  assert.deepEqual(
    [await pathExists(localPath), await pathExists(globalPath)],
    [false, false],
  );
});

test("resolvePolicySettings should fail with StartupValidationFailure when no policy settings exist", async () => {
  const workspace = await makeSettingsWorkspace();
  const examplePath = join(workspace.homeDirectory, ".reinix", "policy.yaml.example");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    (error) =>
      error instanceof StartupValidationFailure
      && error.message.includes("policy.yaml not found")
      && error.message.includes(examplePath),
  );
});

test("resolvePolicySettings should use local policy.yaml instead of global policy.yaml when both exist", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeGlobalSettings(workspace, "policy.yaml", validPolicyYaml({ maxRemediationAttempts: 1 }));
  await writeLocalSettings(workspace, "policy.yaml", validPolicyYaml({ maxRemediationAttempts: 2 }));

  const settings = await resolvePolicySettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(settings.reviewPolicy.maxRemediationAttempts, 2);
});

test("resolvePolicySettings should not merge local and global policy settings", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeGlobalSettings(workspace, "policy.yaml", validPolicyYaml({ maxRemediationAttempts: 3 }));
  await writeLocalSettings(workspace, "policy.yaml", "reviewPolicy:\n  description: local-only\n");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /policy\.yaml reviewPolicy missing required field: maxRemediationAttempts/,
  );
});

test("resolvePolicySettings should reject non-mapping policy.yaml", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "policy.yaml", "- not-a-mapping");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /policy\.yaml must be a mapping/,
  );
});

test("resolvePolicySettings should reject policy.yaml missing reviewPolicy", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "policy.yaml", "other: value\n");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /policy\.yaml must define reviewPolicy/,
  );
});

test("resolvePolicySettings should reject reviewPolicy missing maxRemediationAttempts", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "policy.yaml", "reviewPolicy:\n  description: missing-budget\n");

  await assert.rejects(
    () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
    /policy\.yaml reviewPolicy missing required field: maxRemediationAttempts/,
  );
});

for (const [label, value] of [
  ["negative", -1],
  ["floating-point", 1.5],
  ["string", "5"],
]) {
  test(`resolvePolicySettings should reject ${label} maxRemediationAttempts`, async () => {
    const workspace = await makeSettingsWorkspace();
    await writeLocalSettings(workspace, "policy.yaml", validPolicyYaml({ maxRemediationAttempts: value }));

    await assert.rejects(
      () => resolvePolicySettings(workspace.workingDirectory, { homeDirectory: workspace.homeDirectory }),
      /policy\.yaml reviewPolicy maxRemediationAttempts must be a non-negative integer/,
    );
  });
}

test("resolvePolicySettings should accept maxRemediationAttempts equal to 0", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "policy.yaml", validPolicyYaml({ maxRemediationAttempts: 0 }));

  const settings = await resolvePolicySettings(workspace.workingDirectory, {
    homeDirectory: workspace.homeDirectory,
  });

  assert.equal(settings.reviewPolicy.maxRemediationAttempts, 0);
});

function validPolicyYaml({ maxRemediationAttempts }) {
  const value = typeof maxRemediationAttempts === "string"
    ? JSON.stringify(maxRemediationAttempts)
    : maxRemediationAttempts;

  return `reviewPolicy:
  maxRemediationAttempts: ${value}
`;
}
