# AGENTS

## Issues

- `LAB-*` issues live in the Multica workspace `ai-labs`, which is not the
  CLI default: `multica --workspace-id 4bffb154-c309-4416-917d-22a9fb2b5950 issue get LAB-<n>`.

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
  and System Events) is exactly your path, send ⌘S, then give focus back.
  Never press ⌘S without that check: every window is titled `rexlab.pen`.
  Commit the file from your worktree.
- Never edit another agent's document or branch. If you did, tell that
  agent at once, with what you changed.

## Pull request merge workflow

- For the `pr-merge` workflow, use `scripts/watch-pr.sh` to monitor CI and
  `scripts/finish-merged-pr.sh` to complete local cleanup.
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

- Fix the root cause in the issue's own PR. No stopgap with a follow-up
  issue where the cause can be fixed now.
- A PR closes the issue it names, whole.
- A check that fails or is slow (`-race`, a timeout, a required test) is
  kept: cut the work it checks, do not loosen the check.

## Implementing with Codex

- The implementer is `codex-sol-61`. Use `codex-luna` only when sol is
  severely limited, and only for a very simple task: it is slow on
  production code and writes poor tests.
- Review every Codex implement run with agister's review processes before
  it merges. When sol is limited, run the reviewers one at a time, falling
  back to `claude-opus`.

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

## Logs

- A project's `docs/log.md` records what changed for the product, newest
  first: one or two lines per change worth knowing, with its issue. Leave
  out how it was done, steps, reviews and test changes; the commits and
  docs hold those.

## Long waits

- Run anything that waits for minutes (a Codex review, a CI watch, a long
  test run) in the background, never as a foreground command. Act on its
  completion notice; do not poll its output.
- Run `codex exec` with the prompt from a file (`codex exec ... - < prompt.md`)
  or with `< /dev/null`; given an open input it waits forever. Stop a stuck
  background run with TaskStop, not `pkill -f`.
