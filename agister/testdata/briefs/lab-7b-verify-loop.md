# LAB-7, slice B: the verification loop

Slice A (committed) declares, validates and records `verify`. Implement the
loop of ADR-002 (`agister/docs/adr/002-verify-and-bounded-repair.md`),
rules 3 and 5 to 10, so that a call of a process with `verify` completes
only when its checks pass, and otherwise fails. Read ADR-001 and ADR-002
first. Work in the Go module `agister/`.

## Choices ADR-002 leaves open (take these)

- **Content identity:** the git tree of the checkout's content, tracked and
  untracked files that are not ignored, written through a temporary index
  (`GIT_INDEX_FILE`, `git add -A`, `git write-tree`). It never touches the
  checkout's own index. The captured `changes.patch` is the diff from the
  pinned base to that same tree, so rule 7's reproduction check is: apply
  the patch to the base in a scratch index and compare trees.
- **Bounded output:** the first 8 KiB and the last 8 KiB of combined stdout
  and stderr, with the full size and the SHA-256 of the whole.
- **Command:** `bash -c <command>` in the checkout, in a process group of
  its own, with the operator's environment.

## Behaviour

- After a turn whose output validates, run the command (rule 3). Never
  after a refusal or a failed, interrupted, lost or invalid turn.
- A failing run with attempts left resumes the call's own provider session
  in place (the continuation mechanism; no preset ID, no fork) in the same
  checkout, with the process's `verify.instruction`, the command, its exit
  status and the bounded output. Validate the repair turn like any turn;
  a repair turn that reports a different session fails as a contract
  violation (rule 4). A turn that reports no session ends the node as
  budget exhausted.
- Limits (rule 5): each run bounded by `verify.timeout`; the call's
  effective timeout bounds the whole loop. On either, kill the command's
  whole process group; the node is interrupted, class timeout. Each repair
  turn receives only the remaining cost budget; an earlier turn with
  unknown cost while a cost limit is in effect blocks repair (budget
  exhausted).
- No progress (rule 6): before each run after the first, compare the
  content identity with every identity checked earlier in the call; a
  match ends the loop without running. The same exit status and output
  digest as the previous run also ends it. Both: failed, budget exhausted,
  and the evidence says why.
- A run that changes the content identity is a failed run whatever its
  exit status (rule 7). Completed requires a passing latest run on
  unchanged content and a capture that reproduces it.
- Result shape unchanged (rule 8); the status table in rule 8 holds row by
  row. Output is the latest turn's; usage and cost sum all turns; timing
  covers the loop.
- Evidence (rule 9): per attempt, the command, working directory, exit
  status, timing, bounded output, full size and digest, session, attempt
  number, content identity checked, and the diff the preceding turn made,
  kept as an artifact before the next repair turn starts. The node
  completes only after this is recorded; artifacts are captured whether
  the loop passes or fails. `agister runs show` displays the attempts.
- Ownership (rule 10): the command's process group is an effect of the
  call, recorded like the runtime's, killed on cancellation and cleaned up
  on every exit path, including the reap after a killed CLI.

## Settings and docs

- `agister/examples` gets an implementation process with `verify` (a
  fixture command is fine), passing `agister check`.
- The README describes `verify`: what runs, when, the attempt and time
  limits, the status table, and the operator-authority warning.
- Do not change the repository's own `.agister/processes/implement.yaml`.

## Tests and revert checks

Committed tests with the fake runtimes and `t.TempDir()` repositories, a
fixture verify command driven by files in the checkout (no real `go test`
inside tests). One test each: first-pass success makes no repair turn; a
failing run is repaired in the same session and checkout and then passes;
attempt exhaustion; no progress, including A→B→A; the same failure twice;
a run that changes the checkout; a run timeout and the call timeout (short
durations, seconds at most); cancellation during a run kills its process
group; a failed repair turn and an invalid one; unknown cost blocks
repair; no verification after a failed or invalid first turn; a turn with
no session; capture reproduces the passing content; evidence recorded for
every attempt; the reap cleans up a killed CLI's command process group.
Each test finishes in well under a minute.

A revert-check spec `agister/testdata/revert-checks/verify-loop.spec`, one
mutation per rule above, each caught by the tests it names.

## Checks to run and report

From `agister/`: `gofmt -l .`, `go vet ./...`, `go test -count=1 ./...`,
`go test -race -count=1 ./internal/app/...`. From the repository root,
`scripts/revert-check.py` on every spec in
`agister/testdata/revert-checks/`. Report each with its exit code and final
line, and list every file you changed. Do not commit.

## Out of scope

Anything ADR-002 lists under non-decisions or non-goals; review workflows
(LAB-8); changes to the repository's own settings.
