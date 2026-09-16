---
date: 2026-09-16
model: claude-opus-5
description: "Orchestrator prompt for landing a multi-step refactor through subagents, with Codex review and a judge on every step"
---

# Orchestrated Step Loop

The orchestrator runs each step through a fixed loop and does nothing else: it
spawns agents, runs Codex, and commits. It never verifies, fixes, or repeats a
subagent's work. The pull to do so arrives dressed as economy — a two-line fix
looks cheaper than a spawn — and taking it lands the change in the tree without
passing the loop that exists to check it.

One verification stays with the orchestrator: **provenance**. Subagent reports
describe this session's own edits as pre-existing uncommitted work; three did so
in the run this prompt came from. Check the tree against session-start `HEAD`
yourself, and read "already dirty when I started" as carrying no information.
The same holds for your own edits: when you touch files mid-step, name those
paths in the next subagent's prompt, or it reports them back to you as
pre-existing.

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

The two reviewers run on the same diff and do not see each other's findings. RED
goes to a fixer. Commit only on green tests and a judge verdict with no open
ACCEPT.

ACCEPT is binary: the fixer addresses the finding in this step, or the
orchestrator writes it into `TODO.md` against the step that will carry it. A
ruling that defers without naming a destination leaves the finding in a scratch
file nobody reads again.

Hand the next round's reviewers and judge the verdict file itself. A summary of
it written by hand drops items — one in the run this prompt came from dropped two
of three accepted findings. A finding hand-waved in one round and raised again in
the next is a missing record, not a weak rebuttal.

From round 3 on, only a finding that fails a gate or breaks a stated invariant
re-enters the loop; record the rest and leave them. Each fix is new code that the
next round reviews, so rounds converge only when something stops them.

Markdown waits for the last green round. The orchestrator edits docs once the
judge closes the step: a mid-round docs edit can fail a gate the fixer is being
judged on.

## Subagent prompts

- Under 100 words.
- Name the working directory, the step, and the gate commands.
- Every subagent: no log, no commit. Code subagents also touch no markdown.
- Give the question and the established facts, not the expected answer.
- Running the app happens under a temporary `HOME`. A reviewer that ran
  `npm start` against the real one wrote `~/.noreta` onto the user's machine.

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

The orchestrator runs Codex itself; it is never delegated to a relay subagent.
The second reviewer is a subagent spawned on the same diff. Neither fixes
anything. Untracked new files need `git add -N` first, or the diff omits them.

```bash
RUN="$(mktemp -d)"
~/.claude/scripts/codex-judge/assemble-review-prompt.sh --out "$RUN/findings.md" --range HEAD --repo <worktree> > "$RUN/prompt.md"
~/.claude/scripts/codex-judge/verify-review-prompt.sh "$RUN/prompt.md"
codex exec --sandbox read-only --output-last-message "$RUN/findings.md" - < "$RUN/prompt.md" > "$RUN/run.log" 2>&1
```

Run `codex exec` in the background with a monitor that stops when the process
exits, or on `^(stream error|fatal:|Rate limit|401 Unauthorized|context deadline)`.
Anchor every alternative: unanchored, the pattern matches this file's own text
once Codex reads it, and the monitor reports an error that never happened.

A quiet log is not a stall. A live review writes nothing for minutes at a time —
one round in the run this prompt came from went seven minutes silent and then
finished normally — so never kill a run whose process is alive. What ends the
wait is the process exiting: with a findings file it goes to the judge, and
without one, run it once more and then judge on the reviewer alone, with the
verdict recording that Codex did not report.

## Commits

- Run `git status`, stage explicit paths, then commit in a separate call.
- Short, imperative, lowercase message with no trailers.
- One step per commit; a step with no diff has no commit.
