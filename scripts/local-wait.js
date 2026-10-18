#!/usr/bin/env node
// A job on the self-hosted local-mac runner waits queued while that runner
// is offline, and GitHub fails it only after 24 hours. This watches the
// run's local-mac jobs: once one has waited queued past the limit it names
// them and cancels the run, so the run ends red instead of pending; it
// passes once none waits.
//
// Usage: node scripts/local-wait.js <owner/repo> <run-id> [limit-minutes]

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const label = "local-mac";

// The run's local-mac jobs still queued, and those of them queued past
// limitMs at now.
export function waiting(jobs, now, limitMs) {
  const queued = jobs.filter((job) => job.status === "queued" && (job.labels ?? []).includes(label));
  const stuck = queued.filter((job) => now - Date.parse(job.created_at) > limitMs);
  return { queued: queued.map((job) => job.name), stuck: stuck.map((job) => job.name) };
}

// Polls until no local-mac job waits (after settleMs, so the jobs that
// wait on `changes` are created first) or one waits past limitMs. Returns
// the exit code.
export async function watch({ fetchJobs, cancel, sleep, now, log, limitMs, settleMs, pollMs }) {
  const start = now();
  for (;;) {
    const { queued, stuck } = waiting(fetchJobs(), now(), limitMs);
    if (stuck.length > 0) {
      log(`local-wait: queued over ${limitMs / 60000} minutes, the local-mac runner is offline: ${stuck.join(", ")}`);
      cancel();
      return 1;
    }
    if (queued.length === 0 && now() - start >= settleMs) return 0;
    await sleep(pollMs);
  }
}

function main(argv) {
  const [repo, run, minutes = "15"] = argv;
  if (!repo || !run) {
    process.stderr.write("usage: node scripts/local-wait.js <owner/repo> <run-id> [limit-minutes]\n");
    return Promise.resolve(2);
  }
  const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
  return watch({
    fetchJobs: () => JSON.parse(gh("api", `repos/${repo}/actions/runs/${run}/jobs?per_page=100`, "--jq", ".jobs")),
    cancel: () => gh("run", "cancel", run, "--repo", repo),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    log: (line) => process.stderr.write(`${line}\n`),
    limitMs: Number(minutes) * 60000,
    settleMs: 60000,
    pollMs: 30000,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
