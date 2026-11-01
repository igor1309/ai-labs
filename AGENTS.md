# AGENTS

## Issues

- `LAB-*` issues live in the Multica workspace `ai-labs`, which is not the
  CLI default: `multica --workspace-id 4bffb154-c309-4416-917d-22a9fb2b5950 issue get LAB-<n>`.
- Run `multica` and `gh` outside the sandbox (`dangerouslyDisableSandbox`)
  from the first call; the owner allows it for both. Inside, they fail with
  a TLS certificate error from the sandbox proxy. Do not stop to ask, and
  do not report Multica as unreachable before trying it outside.
- `issue children LAB-<n>` lists a parent's sub-issues with their status;
  `issue create --parent LAB-<n> --title ... --description-file ...`
  adds one; `issue status LAB-<n> <status>` moves it.

## Designing in pen.dev

- Work only on the `.pen` in your own worktree, through the pencil MCP. Do
  it yourself; never ask the owner to open a file or click in the editor.
  Do not use the `pen` CLI: it runs pen.dev's own agent.
- The MCP sends a call to the Pen.app window that has its exact `filePath`
  open. If no window has it, the call silently goes to the last-focused
  window, which may be another agent's file.
- So first open your file in its own window: `open -a Pen <absolute path>`.
  Then give focus back to any other agent's window with
  `open -a Pen <their path>`; that only focuses it.
- Pass your absolute `filePath` on every call. Before the first edit, prove
  the route with a read-only `Get` (e.g. a count of top-level frames).
- Pen.app does not auto-save a file you opened; it only writes a backup,
  and the MCP has no save. To save, focus your window (`open -a Pen <your
  path>`), check that the front window's `AXDocument` (via `osascript`
  and System Events) is exactly your path, then click Pen's File › Save
  through System Events (`click menu item "Save" of menu 1 of menu bar
  item "File" of menu bar 1` of process "Pen"), and give focus back. A ⌘S
  keystroke goes to the terminal while it is the front app, and ⌘W does
  not close a Pen window. Never save without that check: every window is
  titled `rexlab.pen`. Commit the file from your worktree.
- A `.pen` file is JSON. To start a new one, write
  `{"version": "2.21", "children": []}` to its path, then open it.
- Never edit another agent's document or branch. If you did, tell that
  agent at once, with what you changed.

## Pull request merge workflow

- For the `pr-merge` workflow, use `scripts/watch-pr.sh` to monitor CI and
  `scripts/finish-merged-pr.sh` to complete local cleanup.
- `watch-pr.sh` exits 0 when checks pass, which is not the merge: auto-merge
  lands moments later. Wait until `gh pr view` says `MERGED` before running
  cleanup or closing the issue. Run `finish-merged-pr.sh` from the feature
  branch's own worktree.
- Use a merge commit only; do not squash or rebase-merge.
- Do not add a `Co-Authored-By` trailer or any other AI attribution to
  commit messages.
- Never merge a red or incomplete PR. Stop and report the failure if required
  CI fails.
- `scripts/watch-pr.sh` exits 3 when a check has waited 15 minutes for a
  runner, naming it, and 4 when checks are still pending after 90 minutes.
  Either way, stop and report the stuck check. A `local-mac` job means the
  self-hosted runner on this Mac lost GitHub, as it did after a proxy
  password rotation. Do not rerun the watch in a loop.
- Stop if cleanup reports a dirty worktree, a non-fast-forward update, or any
  other unsafe condition. Never force past the check.
- Do not force-merge, force-delete branches, or discard untracked work.

## Fixing a problem

- Before choosing how to do something the platform makes hard, read how
  several open-source apps do it and compare them, preferring the ones
  that measured; one app is an example. Do not use private Apple APIs.
- Fix the root cause in the issue's own PR. No stopgap with a follow-up
  issue where the cause can be fixed now.
- A PR closes the issue it names, whole.
- Fix review findings in code and flaky tests at their cause before a PR is
  marked ready. "It flaked before this branch" and doc-only rewording do not
  count.
- A check that fails or is slow (`-race`, a timeout, a required test) is
  kept: cut the work it checks, do not loosen the check.
- Swift: never synchronously block a cooperative-pool thread waiting for
  future work (no semaphore, `NSCondition`, group wait or queue `sync` on
  async work; no lock held across `await`). Project policy goes further:
  blocking I/O, `Process` launches and blocking framework calls (Core Audio
  HAL, CoreBluetooth setup) run on an executor backed by a dedicated serial
  queue or thread and are awaited, however short; a slow CI runner is no
  excuse.

## State machines

Not every module defines a state machine: an adapter binds an outside API
and a UI module draws a screen. The project's architecture says which
modules are machines. A machine's module picks one of two shapes; an app
composes it.

- **Async** (`ObservableModel`): the machine runs effects. A module defines
  `State`, `Event`, `Effect`, a pure reducer
  `(State, Event) -> (State, Effect?)` and an effect handler with injected
  collaborators. `event(_:)` returns before the event is reduced. Use it
  unless a caller needs the sync order below.
- **Sync** (`SyncModel`): `event(_:)` reduces before it returns, so a read
  of `state` after it includes every event sent before. Use it when a
  caller must read state that includes the events it already sent. A
  module defines `State`, `Event`, a pure reducer `(State, Event) -> State`
  with no effect output, and a doer with injected collaborators. The state
  says what work is due (a phase that holds until its result arrives); the
  doer observes the state, does the work once and sends the result back as
  an event.
- No module imports swift-imrx or any state machine, and none wraps or
  re-implements one. Only an app (a main app or a preview app), or in Audelin
  its composer package, imports swift-imrx. It composes each instance from
  the generic model, the tested
  reducer and the tested effect handler or doer. A sync model stays on the
  actor that made it; callers elsewhere `await` the hop.
- Each reducer state test is paired with an effect test for the same
  `(state, event)`: `assert(state, event, delivers:)`. Effect
  handler tests drive collaborators through spies:
  `expect(sut, with: effect, toDeliver: event, on: { spy.complete(…) })`.
  Doer tests feed it states and check its collaborator and `send` spies,
  including that a state seen twice does the work once.
- `State` is the machine's whole contract, as in Vortex
  (`ios.config/.claude/skills/rx-state-machine-development/references/state-machine-dod.md`
  § Tests and § Dependencies; canonical: `swift-vortex/Tests/Feature/CBDC/Core/PaymentClose/`).
  Every field is public with a public `init`: no hidden bookkeeping, and no computed property
  that derives what is shown. A screen's machine owns UI state, rendered values included. The
  view only renders state, animates transitions and sends user interactions; it decides nothing.
- The reducer produces UI values through injected pure dependencies (a formatter is a closure
  passed to `init`), never through private helpers. Reducer tests check each dependency with a
  spy: no call on init or on no-op paths, the exact payload on each call, and the spy's stub
  value used in the resulting state.
- A reducer test builds its given state with a `make*` factory, gives the expected state as the
  given state plus a mutation closure (`assert(state, event) { $0.status = .dismissed }`), and
  omits the closure for "no change". No test spells out a whole expected state, and reducer
  tests need no `@testable`.

## Writing docs and comments

- Do not add cross-references as traceability theater. A code comment, doc
  or log entry says what it means in its own words; it does not point at
  another document's path, decision number, invariant or scenario id
  ("ADR-001 decision 4", "S-14", "`spec/x/QA.md`"). Each such pointer ties
  the text to the other document's layout and turns false when it changes.

## Implementing with Codex

- Size the process to the task. A small task (one test or a few lines in
  one module, no product-behaviour change) is done by hand, without a
  Codex brief, an agister run or an agister review: write it, run its
  tests, read the diff once yourself and open the PR. Codex and agister
  are for larger work.
- The implementer is `codex-sol-61`. Use `codex-luna` only when sol is
  severely limited, and only for a very simple task: it is slow on
  production code and writes poor tests.
- After Codex stops on a quota limit, start a fresh run once it is back;
  do not resume the stopped one. When the `claude-opus` fallback is limited
  too, send one ntfy push and wait; do not try other agents.
- Review a branch against its merge-base with trunk, after merging trunk
  in. A base on a trunk that has moved on shows trunk's new work as the
  branch deleting it.
- Review every Codex implement run of a larger task with agister's review
  processes before it merges. When sol is limited, run the reviewers one
  at a time, falling back to `claude-opus`.
- An implement run's `verification` is the record of what it checked:
  each command, its exit code and its last line. Read it before
  committing; do not run its checks again. Run only what it lacks: a
  check it names no command for, a failed or empty verification, or code
  that changed after the run, such as a merge or a fix by hand.

## Verifying fixes

- Prove a fix with a regular, committed test: set up a temp directory
  (`t.TempDir()`), put the bad input there, and assert the expected failure.
- Do not verify by hand by planting broken files and running the binary;
  that is expensive, unreliable, and never runs again.
- Mutation tests are not welcome: no mutation specs, no revert checks, no
  reverting by hand. They are slow, load the machine, and prove nothing a
  normal test cannot.
- A behaviour no normal test can make fail means the code lacks a seam (an
  injected closure, spy, clock or hook). Add the seam.
- Before you delete a throw-away test, one written to explore or reproduce
  something, consider keeping it as a regression test.

## Reaching the owner

- When you need the owner and they are away, send one ntfy push:
  `curl -s -m 10 -H "Title: <short>" -H "Tags: bell" -d "<one-line ask>" "https://ntfy.sh/$(cat ~/.config/ntfy/topic)"`.
  The topic file is the one `~/.claude/hooks/limit-hit-ntfy.sh` uses.
- Push only for a real block or a decision that is the owner's: one ask per
  push. Keep working on whatever does not depend on the answer.
- When Codex stops on its usage or quota limit (a Codex review or an
  agister step that runs Codex), send one ntfy push at once, whether or
  not the owner is away: `-H "Title: Codex quota limit" -H "Priority: high"
  -H "Tags: no_entry"`, with the repo, the step that stopped and the reset
  time Codex gives, if any. Do not retry the call in a loop; keep working
  on whatever does not need Codex.
- When Codex or Claude fails with "model at capacity", retry the call
  once; if it fails again, go on without it and say so in the report.
- Do not put questions to the owner. For a product, scope or issue-split
  call, weigh the options and suggest one, with its reason, for the owner
  to accept or change. Make technical choices yourself (where a setting is
  stored, how data is laid out) and state them in the plan.
- Before building a large issue, present a top-level plan, including any
  restructuring of its issues, and wait for the owner's answer.

## Adding a project

A project is a top-level directory, named in lower-case kebab-case. Each
place below is checked by a test or read by a tool; miss one and CI or the
daily dashboard flags it.

- Give it a `README.md` (what it is, its status, how to run it) and a
  `docs/log.md` (see Logs). Add an `AGENTS.md` when it has rules of its own.
- Add a row to `## Components` in the root `README.md` (or `## Structure`
  for a docs-only area). These two tables are the project registry the
  dashboard-sync agent reads (`dashboard-sync-agent/README.md`).
- Add the name to `scripts/loc-dashboard.sh` in three places: the header
  comment, the `for proj in ...` loop, and `known` in `check_project_drift`.
  Add its row to the `data = [...]` array in `docs/loc-dashboard.html`.
  `scripts/tests/loc-dashboard.test.js` fails when the loop and the chart
  differ, or when trunk shows a drift warning.
- For a product, add its card to `docs/products.html`; a landing page it
  links must exist (same test).
- If it has tests, give it a `.github/workflows/<project>-core.yml`
  reusable workflow and, in `.github/workflows/ci.yml`: a `<project>` path
  filter listing its code paths only (no `<project>/**`, no docs) and a
  `<project>-ci` filter for its workflow files, both in `changes.outputs`;
  a `<project>-core` job gated on them and on `workflow_dispatch`; and the
  job in `needs` of `report` and `notify` and in `notify`'s
  `job_results`. Rules: `.github/workflows/AGENTS.md` and `README.md`
  there, whose "What CI runs" table gets a row too.
  `scripts/tests/ci-workflow-paths.test.js` fails while any tracked test
  file selects no job or a job does not run on manual dispatch.
- If it ships releases, add it to `paths` in `release-units.config.toml`,
  give it one `package.json` or `release.toml`, and regenerate
  `release-units.toml` with `node scripts/release/generate-manifest.js`;
  `release-validation` in `ci.yml` fails on a stale one (`--check`).

## Logs

- A project's `docs/log.md` records what changed for the product, newest
  first: one or two lines per change worth knowing, with its issue. Leave
  out how it was done, steps, reviews and test changes; the commits and
  docs hold those.

## Sandbox

- `gh`, `multica`, `agister` and `git fetch`/`push` fail inside the
  sandbox with TLS errors; run them with the sandbox off.

## Long waits

- Run anything that waits for minutes (a Codex review, a CI watch, a long
  test run) in the background, never as a foreground command. Act on its
  completion notice; do not poll its output.
- Run `codex exec` with the prompt from a file (`codex exec ... - < prompt.md`)
  or with `< /dev/null`; given an open input it waits forever. Stop a stuck
  background run with TaskStop, not `pkill -f`.
