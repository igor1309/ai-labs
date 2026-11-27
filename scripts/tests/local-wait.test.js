import assert from "node:assert/strict";
import test from "node:test";

import { waiting, watch } from "../local-wait.js";

const minute = 60000;
const t0 = Date.parse("2026-10-18T10:00:00Z");
const job = (name, status, createdMinutes, labels = ["self-hosted", "local-mac"]) => ({
  name,
  status,
  labels,
  created_at: new Date(t0 + createdMinutes * minute).toISOString(),
});

test("localWait_shouldNameLocalJobsQueuedPastTheLimit", () => {
  const jobs = [
    job("agister-core / core", "queued", 0),
    job("warder-core / core", "queued", 10),
    job("repo-scripts", "queued", 0, ["ubuntu-latest"]),
    job("loki-core / core", "in_progress", 0),
  ];

  assert.deepEqual(waiting(jobs, t0 + 16 * minute, 15 * minute), {
    queued: ["agister-core / core", "warder-core / core"],
    stuck: ["agister-core / core"],
  });
});

// A run whose jobs are listed in turn: each poll takes the next list,
// the last one repeating, and a poll moves the clock on a minute.
function run(lists, runnerBusy = () => false) {
  let clock = t0;
  let polls = 0;
  const calls = { cancelled: false, logged: [] };
  const code = watch({
    fetchJobs: () => lists[Math.min(polls++, lists.length - 1)],
    runnerBusy,
    cancel: () => {
      calls.cancelled = true;
    },
    sleep: async () => {
      clock += minute;
    },
    now: () => clock,
    log: (line) => calls.logged.push(line),
    limitMs: 15 * minute,
    settleMs: minute,
    pollMs: minute,
  });
  return code.then((exit) => ({ exit, ...calls }));
}

test("localWait_shouldCancelTheRun_whenALocalJobWaitsPastTheLimit", async () => {
  const got = await run([[job("agister-core / core", "queued", 0)]]);

  assert.equal(got.exit, 1);
  assert.equal(got.cancelled, true);
  assert.match(got.logged.join("\n"), /agister-core \/ core/);
});

test("localWait_shouldPass_whenTheLocalJobsFinish", async () => {
  const got = await run([
    [job("agister-core / core", "queued", 0)],
    [job("agister-core / core", "in_progress", 0)],
    [job("agister-core / core", "completed", 0)],
  ]);

  assert.deepEqual(got, { exit: 0, cancelled: false, logged: [] });
});

test("localWait_shouldAllowQueuedJobsWhileTheMacIsBusy", async () => {
  const queued = job("warder-core / core", "queued", 0);
  const active = job("agister-core / core", "in_progress", 0);
  const got = await run([
    ...Array.from({ length: 20 }, () => [active, queued]),
    [queued],
    [job(queued.name, "in_progress", 0)],
    [job(queued.name, "completed", 0)],
  ]);

  assert.deepEqual(got, { exit: 0, cancelled: false, logged: [] });
});

test("localWait_shouldAllowTheMacToFinishAnotherWorkflow", async () => {
  const queued = job("warder-core / core", "queued", 0);
  const got = await run([
    ...Array.from({ length: 20 }, () => [queued]),
    [job(queued.name, "in_progress", 0)],
    [job(queued.name, "completed", 0)],
  ], () => true);

  assert.deepEqual(got, { exit: 0, cancelled: false, logged: [] });
});

test("localWait_shouldWaitForJobsCreatedAfterChanges_beforePassing", async () => {
  const got = await run([[], [job("agister-core / core", "queued", 1)], [job("agister-core / core", "queued", 1)]]);

  assert.equal(got.exit, 1);
  assert.equal(got.cancelled, true);
});
