---
date: 2026-11-01
model: claude-opus-5-5
description: "Pages implementation notes: the Runs and Compare views over the run store, then Settings"
---

# Pages implementation notes

## Runs and Compare

`agister pages [--addr <host:port>] [--no-open]` serves the page at
`127.0.0.1:7465` by default until its context ends. On a cancelled context
the server shuts down and the command exits 0. A port in use is an error
on stderr, exit 1.

**The port.** `pages` declares `Runs`: `IDs()`, every run's id, and
`Run(id)`, one run in pages' own types, or an error; `ErrNotFound` for a
run not kept. The composition's adapter maps `runstore.Snapshot` and
`runstore.Observe`, the same calls `agister status` makes, to it.

**List.** `GET /api/runs?limit=<n>`, default 200, at most 1000. Run ids
begin with their UTC start, so pages sorts ids descending and reads until
the limit is met; a run's id ties break the same way. Reading stops there:
a list costs the limit, not every run kept. `total` is the ids' count;
`skipped` counts unreadable runs met while reading. Each row: id, workflow,
process, agent, started, ended, status, class, reason, duration in
milliseconds, cost, and the count of its calls.

**Detail.** `GET /api/runs/{id}`: the row, each call (step, process, agent,
status, class, duration, cost), each child (id, workflow, status, class),
the params, the working directory and the result's output.

**Compare.** `GET /api/runs/compare`: every call, of any readable run,
that itself ended completed or failed, whatever its run's status,
grouped by process and agent: runs, completed, pass rate, median
duration, total cost, and how many had no cost. It reads all runs, on
request only.

**The page.** Runs and Compare from `archive/pages` (`index.html`,
`page.js`, `runs.js`), embedded, with their table narrowed to the columns
above. Verify, Skills and Tool calls go: the current record does not hold
them as such. The Settings and Knowledge tabs, the picker and their code
are not served. The page's JS logic keeps its tests in `node --test`.

**Install.** `scripts/loop/install.sh` also renders the launch agent from
`deploy/launchagent.plist.in` (from the archive) with `agister pages
--no-open`, and reloads it.

## Decisions

- The Runs view comes first and alone: it is what is broken today.
- The stopgap binary is removed when this ships, though Settings comes in a
  later PR: a working Runs view is worth more than a Settings view whose
  format is unconfirmed.
- No cache: reading the limit's runs per request is measured before one is
  added.
- Knowledge stays in the archive.
- The composition is tested over a spy in place of the run store
  (ADR-009); how log-only, record.json and unparsable runs are read is
  runstore's to test.
