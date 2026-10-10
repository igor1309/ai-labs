# LAB-163: the warder merges under scrutiny

Warder was built through Agister on 2026-10-09 (PR #926, then #927–#932).
This note audits what those merges changed outside `warder/`, what the
implementers and reviewers were given, what the review rounds produced,
which Agister ideas were broken, and how. Data: the run records under
`~/.agister/runs/` from 2026-10-08 to 2026-10-10 that mention warder
(173 runs; a few are LAB-147 and LAB-164 runs that only mention it).

## Rulings on the changes outside `warder/`

| Change | Ruling | Where it stands |
|---|---|---|
| `.agister/processes/implement_warder.yaml` (273de3e7), a copy of `implement` that differs only in `verify` | Revert | Deleted by LAB-164 (9946304f); warder's check is its project layer, `warder/.agister/verifies/repo.yaml` (ADR-028). |
| `.agister/verifies/warder.yaml` | Revert | Replaced by the same project layer (9946304f). |
| `agister/pages/tests/config.test.js` widened to accept the warder verification (ad0b82e3, implement run 20261009T172251Z-fc961f) | Revert | Rewritten by LAB-164. No review run had the file among its changed files. |
| `agister/home/runtimes/codex.yaml`: `0.162.` added to `verified`, and 11 more lines of observation log (442cca71, merged into the warder branch by 0c1670f8) | Keep the value; rewrite the proof | The 42-line log is replaced by `agister/scripts/codex-sandbox-contract.py`, which passed on codex-cli 0.162.0 (this change). |
| CI: `ci.yml`, `agister-core.yml`, `warder-core.yml`, `scripts/tests/ci-workflow-paths.test.js` | Keep | A new module needs its CI. |
| `warder/AGENTS.md` (108 lines at #926) | Rewrite | 15 lines (#936): the design pointer, the module layout `arch_test.go` keeps, where logging lives, the check, `GOPRIVATE`. |
| `warder/README.md` (252 lines) | Rewrite | 47 lines (#936); `warder -h` now prints the usage, flags and exit codes. |

## What the nodes were given

Marked by input, over every run of each process; the briefs were not
marked one by one (LAB-154).

| Input | Size | Marking |
|---|---|---|
| Implementer brief | 2.1–7.3 KB, 3.4 KB on average (22 distinct) | Needed. The LAB-158 brief's Sources section (about a third of it) looks like history but is the task's own material: done-when 7 has the spec record the rejected candidates, and it keeps the implementer off them. |
| Go guidance to implementers, `go-architecture` + `go-testing-seams` | 13 KB, every run | Needed: warder is Go. |
| Reviewer goal (the brief) | 2.1–7.7 KB, 4.0 KB on average | Needed: reviewers check the goal (ADR-023). |
| Reviewer prompt | 3.3–8.7 KB | Needed; the architecture and tests prompts carry their own Go sections. |
| Go guidance to reviewers | none in 18 of 20 rounds | Belonging elsewhere: reviewers followed the `warder/AGENTS.md` pointer to `.agister/prompts/go-architecture.md` (judge 20261009T141035Z-1c618e quotes it). Declared per node by LAB-161. |
| `warder/AGENTS.md` | 3–5.7 KB, loaded by every node | Duplicated: it restated `go-architecture.md`, what `arch_test.go` enforces, the verify and the README. |

Prompt bytes were not the cost. A reviewer run read 470–670K input tokens
against 6–16 KB of prompt and goal; the cost is the number of rounds.

## The review rounds

The warder worktrees cost about $51: implement $25, the five reviewers
$23, the judge $3 (`turn.cost_usd`). 19 judge runs ruled on 57 items:

| Ruling | Items |
|---|---|
| fix | 41 |
| owner (behaviour the brief left unstated, LAB-150) | 15 |
| waive | 1 |

Upheld fixes by reviewer: tests 30, adversarial 18, architecture 10,
intent 10, clarity 6; 15 items were raised by more than one reviewer. The
`warder` branch took 10 rounds, and rounds 9 and 10 still had 6 and 4
fixes. "Real defect" here is the judge's ruling: the 41 fixes were not
checked by hand, so whether six nodes per round paid for themselves on
packages this small stays open.

## The Agister ideas broken

1. **One definition per process.** `implement_warder.yaml` copied
   `implement` to change one field (273de3e7); LAB-147 then had to edit
   that copy too (ec0d526e). Against ADR-014 ("a repository replaces one
   prompt without copying the processes that use it") and ADR-010 ("a
   repository states its verification once"). ADR-028 since makes a
   project's settings a layer.
2. **Guidance is a declared input.** Reviewers got the Go rules by an
   AGENTS.md pointer, not as an input (judge 20261009T141035Z-1c618e).
   Against ADR-014 (a process gives a prompt to its agent as an input).
   Fixed by LAB-161.
3. **Linked, not restated.** `warder/AGENTS.md` and most sub-issue
   descriptions restated the architecture rules of `go-architecture.md`.
   Against ADR-026 ("intent is linked, not restated: a restatement
   drifts") and ADR-028 ("one prompt text has one file").
4. **Proof is a committed test.** `codex.yaml`'s `verified` versions rested
   on hand observations kept as a comment (442cca71). Against the
   repository's `AGENTS.md` ("Verifying fixes": no verifying by hand).
5. **A check is not weakened to pass.** An implement run widened an
   Agister test to accept its own new setting (ad0b82e3). Against the
   verify instruction ("do not weaken, skip or delete a check or a test").

## How the merges got through

- **A project's PR could change Agister.** Nothing stopped #926 from
  carrying home's `codex.yaml`, an Agister test and the repository's
  settings. Now `scripts/pr-scope.js` fails such a PR in CI (#936).
- **The reviewers did not look.** The `codex.yaml` log passed four review
  rounds: clarity read it as a "why" comment, and tests saw no code
  change. The clarity and tests prompts now make both a finding (#937).
- **Not every commit was reviewed.** ad0b82e3, the widened Agister test,
  was in no review run's changed files.
