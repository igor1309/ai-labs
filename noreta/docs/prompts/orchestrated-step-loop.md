---
date: 2026-09-16
model: claude-opus-5
description: "Orchestrator prompt for landing a multi-step refactor through subagents, with Codex review and a judge on every step"
---

# Orchestrated Step Loop

The orchestrator spawns agents, runs Codex, and commits. It never verifies,
fixes, or repeats a subagent's work — a two-line fix looks cheaper than a spawn
and skips the loop that would have checked it.

Provenance stays with the orchestrator: check the tree against session-start
`HEAD` yourself, and read "already dirty when I started" as carrying no
information. Name your own mid-step edits in the next subagent's prompt, or they
come back reported as pre-existing.

## Loop per step

implementer → tester → (Codex-reviewer ‖ reviewer) → judge → (accepted: fixer → tester → both reviewers → judge) → commit

### Roles

| Role | Input | Responsibility | Output |
| --- | --- | --- | --- |
| Orchestrator | the step list | spawns, runs Codex, hands both reviews to the judge, commits — verifies only provenance | one commit per step |
| Implementer | working dir, step, gates | makes the step's change | edited code, no commit |
| Tester | working dir, gates | runs the gates | GREEN with the third gate's counts, or RED with the list of failed tests |
| Codex-reviewer | uncommitted diff | reviews read-only, fixes nothing | findings file |
| Reviewer | uncommitted diff | reviews independently of Codex, read-only, fixes nothing | findings file |
| Judge | both findings files, diff | rules each finding ACCEPT or HAND-WAVE with file:line evidence; independent pass when both reviewers return nothing | verdict file, the settled record for later rounds; returns its path to the orchestrator |
| Fixer | ACCEPT findings | addresses them and nothing else | edited code, no commit |

Both reviewers see the same diff and not each other. RED goes to a fixer. Commit
only on green tests and a verdict with no open ACCEPT.

- ACCEPT is binary: fixed in this step, or written into `TODO.md` against the
  step that carries it. Deferring without a destination loses it.
- Hand the next round the verdict file itself; a hand-written summary dropped
  two of three accepted findings.
- From round 3, only a gate failure or a broken invariant re-enters the loop.
- Markdown waits for the last green round: a mid-round docs edit can fail the
  gate the fixer is judged on.

## Subagent prompts

- Under 100 words.
- Name the working directory, the step, and the gate commands.
- Every subagent: no log, no commit. Code subagents also touch no markdown.
- Give the question and the established facts, not the expected answer.
- Run the app under a temporary `HOME`; one reviewer's `npm start` wrote
  `~/.noreta` onto the user's machine.

## Gates

Run from the repository root:

```bash
./scripts/run_silent.sh "tests" npm run test:noreta
./scripts/run_silent.sh "build" npx tsc --noEmit -p noreta
node --import tsx --test noreta/tests/*.test.ts 2>&1 | tail -12
```

Tests and build run per module and so cannot see a property of the import graph.
The architecture invariant this loop exists to land needs its own check:

```bash
grep -rn 'from "\./' noreta/src | grep -vE 'ordering|grouping|claude-code-files|git-repository'
```

Expect lines only in `main.ts`, `composition-root.ts` and
`compose-claude-code-runtime-states.ts` — the composition pieces. Any other file
importing a module is the invariant broken.

## Reviews

The orchestrator runs Codex itself, never through a relay subagent. Untracked
new files need `git add -N` first, or the diff omits them.

```bash
RUN="$(mktemp -d)"
~/.claude/scripts/codex-judge/assemble-review-prompt.sh --out "$RUN/findings.md" --range HEAD --repo <worktree> > "$RUN/prompt.md"
~/.claude/scripts/codex-judge/verify-review-prompt.sh "$RUN/prompt.md"
codex exec --sandbox read-only --output-last-message "$RUN/findings.md" - < "$RUN/prompt.md" > "$RUN/run.log" 2>&1
```

Monitor it in the background until the process exits, or on
`^(stream error|fatal:|Rate limit|401 Unauthorized|context deadline)` — anchored,
or the pattern matches this file's own text once Codex reads it.

A quiet log is not a stall; one round went seven minutes silent and finished
normally. Never kill a live process. On exit with findings, go to the judge;
on exit without them, rerun once, then judge on the reviewer alone and say so in
the verdict.

## Commits

- Run `git status`, stage explicit paths, then commit in a separate call.
- Short, imperative, lowercase message with no trailers.
- One step per commit; a step with no diff has no commit.
