import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { createRun, createRunId, readRunMetadata, updateRunMetadata } from "../src/run-store.js";
import { makeSettingsWorkspace } from "./helpers/settings.js";

test("createRunId should create the required UTC timestamp and lowercase alphanumeric suffix format", () => {
  const runId = createRunId({
    clock: () => new Date("2026-04-27T09:08:07.000Z"),
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  assert.match(runId, /^20260427T090807Z-[a-z0-9]{8}$/);
});

test("createRun should create the run directory under the global Reinix runs root", async () => {
  const workspace = await makeSettingsWorkspace();
  const run = await createRun({
    clock: () => new Date("2026-04-27T09:08:07.000Z"),
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  const runDirectoryStat = await stat(run.runDirectory);

  assert.equal(runDirectoryStat.isDirectory(), true);
});

test("updateRunMetadata should allow end time status and final exit code updates", async () => {
  const workspace = await makeSettingsWorkspace();
  const run = await createRun({
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  await updateRunMetadata(run.runDirectory, {
    endTime: "2026-04-27T09:09:07.000Z",
    exitCode: 1,
    status: "failed",
  });

  assert.deepEqual(await readRunMetadata(run.runDirectory), {
    endTime: "2026-04-27T09:09:07.000Z",
    exitCode: 1,
    runId: run.runId,
    startedAt: (await readRunMetadata(run.runDirectory)).startedAt,
    status: "failed",
  });
});

test("updateRunMetadata should reject metadata fields other than end time status and final exit code", async () => {
  const workspace = await makeSettingsWorkspace();
  const run = await createRun({
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  await assert.rejects(
    () => updateRunMetadata(run.runDirectory, { currentStep: "producer" }),
    /run metadata field is immutable: currentStep/,
  );
});

test("createRun should write running metadata without progress fields", async () => {
  const workspace = await makeSettingsWorkspace();
  const run = await createRun({
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  const metadata = await readFile(`${run.runDirectory}/metadata.json`, "utf8");

  assert.equal(metadata.includes("currentStep"), false);
});

test("createRun should use the same timestamp for run id and started metadata", async () => {
  const workspace = await makeSettingsWorkspace();
  const dates = [
    new Date("2026-04-27T09:08:07.000Z"),
    new Date("2026-04-27T09:08:08.000Z"),
  ];
  const run = await createRun({
    clock: () => dates.shift(),
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  const metadata = await readRunMetadata(run.runDirectory);

  assert.deepEqual(
    { runIdTimestamp: run.runId.slice(0, 16), startedAt: metadata.startedAt },
    { runIdTimestamp: "20260427T090807Z", startedAt: "2026-04-27T09:08:07.000Z" },
  );
});
