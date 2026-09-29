# Implementer A/B: Opus vs Sonnet on one real task

2026-09-29. One task, one run each, through Agister. A single real sample,
not a benchmark.

## The task

Three P2 findings a reviewer left on PR #829 (agister deferred fixes):

1. **Background recovery failures are unobservable.** `Reaper.Reap` gave up
   silently when it could not list abandoned runs, and ignored failures to
   append `EFFECTS_REAPED` or finish a run; the background reap was
   fire-and-forget.
2. **Review inputs can resolve different revisions.** The checkout, `diff`
   and `changed_files` each resolved the mutable base and candidate names
   on their own, so a ref moving mid-resolution gave an agent inconsistent
   inputs. The owner's decision: an input value may reference another's
   resolved value as `${value.<name>}`.
3. **`revert-check.py` discards the `go test` exit status.** A `TestMain`
   failing after the tests pass read as a green baseline.

The fixes touch the app, domain, CLI, the `.agister` process definitions and
a Python script with its Node tests. Each fix needs a test that fails
without it and revert-check mutations.

## Setup

| | |
|---|---|
| Process | `.agister/processes/implement.yaml`: `run implement --agent <name>` |
| Agents | `claude-implementer-opus`, `claude-implementer-sonnet`: Claude Code 2.1.284, `effort = "high"`, fresh session |
| Policy | `implement`: read-write candidate checkout, Bash, 45m, $25, 1 attempt |
| Candidate | `c8d9a563` for both |
| Brief | the three findings verbatim, the owner's decision, pointers to the project's rules (`AGENTS.md` "Verifying fixes", `prompts/code-review-tests.md`), 277 words |

The runs were sequential, each in its own checkout. Cost, time and tokens
come from the run records (cost source: runtime).

An earlier pair of runs is discarded. Their brief carried the orchestrator's
design (types, wiring, test shapes, "document it in docs"), so they compared
plan-following, not implementation, and the two designs came out nearly
identical. The docs line also led Sonnet to edit ADR-001.

## Results

| | Opus (`20260929T160017Z-237f10`) | Sonnet (`20260929T161123Z-3e54f9`) |
|---|---|---|
| Status | completed | completed |
| Cost | $2.72 | **$1.31** (−52%) |
| Wall time | **11m06s** | 18m57s (+71%) |
| Output tokens | 48,129 | 32,242 |
| Files changed | 19 | 23 |
| New spec | `review-fixes.spec`, 15 mutations | `review-fixes.spec`, 9 mutations |
| Existing spec | 2 mutations repaired, 59/59 | the same 2 repaired, 59/59 |
| New Node tests for fix 3 | 2 (exit 1 after passing tests; exit 0 after a failing test) | 1 |

## Verification (by the orchestrator, each patch on its own worktree)

| Check | Opus | Sonnet |
|---|---|---|
| `handoff-check --claimed <its list> --spec <both>` | 0 problems | 0 problems |
| gofmt, vet, `go test -race -timeout 1m ./...` | pass | pass |
| `revert-check.py`, both specs | 59/59, 15/15 | 59/59, 9/9 |
| `agister check` | OK | OK |
| Node tests (`scripts/tests/*.test.js`) | 24 pass, 1 fail | 23 pass, 1 fail |

The one Node failure ("emits no drift warnings on a clean trunk") is
unrelated and fails on the base as well. Neither run left a mutation or an
unclaimed change. Both self-reports matched what was found, except that
Sonnet's `go test` was served from the cache and its gofmt ran before its
last edit, both of which it said.

## How they differ

With findings only, the designs share their shape: `Reap(ctx) error`, a
`func(error)` sink on `BackgroundReaper` wired to the diagnostic log, a
single-pass bind, references only to values declared earlier, and a refused
reference to a non-text value. The differences:

- **Scope.** Opus fixed what the finding named (the `.agister` reviewers
  and judge) and reported that the shipped examples have the same bug.
  Sonnet also fixed the examples. Both are defensible; the owner took
  Sonnet's example fixes.
- **Tests.** Opus proved more: two Node tests for the exit status in both
  directions, 15 mutations to 9, and a composition-root test that reads the
  log file.
- **Proving fix 3.** Opus ran the new test against the unchanged script in a
  scratch directory. Sonnet swapped the old script into its checkout and
  restored it: the revert by hand `AGENTS.md` rules out, though confined to
  a throwaway checkout.
- **Docs.** Sonnet updated deferred item 2's "done" text to say reap
  failures reach the diagnostic log (accurate). Opus touched no docs.
  Neither touched an ADR or the README.
- **Report.** Opus listed `AGENTS.md` orchestrator steps it did not do
  (delegating, the Codex review): it read the orchestrator's instructions
  as its own. That is noise, and a sign the brief should say which role's
  rules apply.

Outcome: the Opus patch plus Sonnet's three example fixes went to PR #829.

## Reading

- On this task Sonnet cost half as much and took 70% longer. Its patch was
  complete and correct, with thinner tests.
- Opus was faster and more thorough in proof, and more careful about scope.
- The difference that mattered was not the model but the brief. Given the
  orchestrator's design, both models converged on it; given findings, they
  made their own, comparable choices.

## Caveats

- One sample each. Both runs got rate-limit warnings (`allowed_warning`:
  Opus 23, Sonnet 12), which may have shaped the wall times.
- The orchestrator's cost (briefing, verifying) is in neither number.
