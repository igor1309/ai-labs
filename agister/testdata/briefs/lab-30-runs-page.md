# LAB-30 part 2: a Runs view on the Agister pages

Part 1 (commit 28bd4b51) added `GET /api/runs`, `GET /api/runs/<id>` and
`GET /api/runs/compare` to `agister pages`; `pages/README.md` describes
what they return and `pages/runs.go` is the source of truth for the JSON.
This part shows that data on the page. Do not change the endpoints or Go
code unless a test proves one wrong; say so if you do.

## The view

Add a second view next to the settings dashboard: two buttons in the
header, **Settings** and **Runs**, the chosen one remembered in
localStorage (`agister-pages:view`) like `agister-pages:current`. Runs are
Agister home's whatever the picker shows; say so in one line at the top
of the view. ↻ reloads the shown view.

The Runs view has, in order:

1. **Compare**: one table per process from `/api/runs/compare`, a row per
   runtime adapter, model and effort: runs, completed, pass rate, mean
   verify attempts, median wall time, cost per completed run (and the
   unknown-cost count when not zero). A process with a single row still
   shows its table. An empty effort shows as `-`.
2. **Runs**: a table from `/api/runs`, newest first: started, process,
   implementor (`adapter model effort`, the reported model in a title when
   it differs), status, verify (`2/3 ✓` style: attempts used, pass mark;
   empty when the run has no verify), wall time, cost, skills used
   (`name×n`), tool calls. A workflow run's row shows its node count and
   its judge counts by ruling instead of implementor and skills. Filters
   above it: process (a select of the processes present) and status.
   `skipped` runs, when not zero, are mentioned under the table.
3. **Run detail**: clicking a row opens the run (from `/api/runs/<id>`)
   below the table, as a card in the page's existing card style:
   implementor, policy, outcome, skills, the parent workflow as a link
   that opens it, and for a workflow its nodes (each a link that opens
   that node's run) and the judge counts by ruling, by severity, and per
   source with the source's node name. A collapsed `<details>` shows the
   record as stored, pretty-printed.

Durations as `1m 47s` / `412ms`, costs as `$0.50`, times in local time as
the page already shows them. Match the page's existing look: its CSS
variables, cards, tables, the narrow-screen layout where table rows
become label and value lines, and amber/red only as the settings view
uses them (red: failed or interrupted status).

## Code

Put the logic that has no DOM in a new `pages/runs.js` that sets
`globalThis.AgisterRuns`, as `repos.js` sets `AgisterRepos`: formatting
(duration, cost, verify, implementor line, skills line), filtering by
process and status, the process list for the select, and turning the
compare groups into per-process tables. Add the fetch calls to `repos.js`
next to the existing ones, or to `runs.js` if that reads better. Render in
`index.html`. Embed `runs.js` in the binary (`serve.go`'s `go:embed` list)
and assert in `serve_test.go` that it is served.

## Tests

`pages/tests/runs.test.js` (node:test, as the existing tests): each
formatter, including empty and missing values; filtering; the process
list; the compare tables, with a process of two configurations and an
empty effort. Use summaries shaped as `pages/runs.go` writes them.

Update `pages/README.md`: the Runs view and the new localStorage key, in
its existing style. Run the full check from `agister/` (its AGENTS.md) and
`node --test pages/tests/*.test.js`. Report each command with its exit
code and final line, and list every file you changed.
