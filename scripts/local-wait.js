#!/usr/bin/env node
// A job on the self-hosted local-mac runner waits queued while that runner
// is offline, and GitHub fails it only after 24 hours. This watches the
// run's local-mac jobs: it cancels a stalled queue and allows the runner
// to finish jobs already in progress.
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
export async function watch({ fetchJobs, runnerBusy, cancel, sleep, now, log, limitMs, settleMs, pollMs }) {
  const start = now();
  let lastProgress = start;
  for (;;) {
    const jobs = fetchJobs();
    const time = now();
    const local = jobs.filter((job) => job.labels?.includes(label));
    const active = local.some((job) => job.status === "in_progress");
    const { queued, stuck } = waiting(local, time, limitMs);
    if (active) lastProgress = time;
    if (stuck.length > 0 && time - lastProgress > limitMs) {
      if (runnerBusy()) {
        lastProgress = time;
      } else {
        log(`local-wait: no local-mac progress for ${limitMs / 60000} minutes: ${stuck.join(", ")}`);
        cancel();
        return 1;
      }
    }
    if (!active && queued.length === 0 && time - start >= settleMs) return 0;
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
  const pages = (path, field) =>
    JSON.parse(gh("api", "--paginate", "--slurp", path)).flatMap((page) => page[field]);
  const fetchJobs = (id) => pages(`repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "jobs");
  return watch({
    fetchJobs: () => fetchJobs(run),
    runnerBusy: () => pages(`repos/${repo}/actions/runs?status=in_progress&per_page=100`, "workflow_runs")
      .some(({ id }) => String(id) !== run && fetchJobs(id)
        .some((job) => job.status === "in_progress" && job.labels?.includes(label))),
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
