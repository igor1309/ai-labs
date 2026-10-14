# LAB-163: the warder merges under scrutiny

Warder was built through Agister on 2026-10-09 (PR #926, then #927–#932).
This note audits what those merges changed outside `warder/`, what the
implementers and reviewers were given, what the review rounds produced,
which Agister ideas were broken, and how. Data: the 159 run records under
`~/.agister/runs/` whose working directory is one of the warder worktrees
(`warder`, `warder-logging`, `warder-codex`, `lab-157`, `lab-159`).

## Rulings on the changes outside `warder/`

| Change | Ruling | Where it stands |
|---|---|---|
| `.agister/processes/implement_warder.yaml` (273de3e7), a copy of `implement` that differs only in `verify` | Revert | Deleted by LAB-164 (9946304f); warder's check is its project layer, `warder/.agister/verifies/repo.yaml` (ADR-028). |
| `.agister/verifies/warder.yaml` | Revert | Replaced by the same project layer (9946304f). |
| `agister/pages/tests/config.test.js` widened to accept the warder verification (ad0b82e3, implement run 20261009T172251Z-fc961f) | Revert | Rewritten by LAB-164. No review run had the file among its changed files. |
| `agister/home/runtimes/codex.yaml`: `0.162.` added to `verified`, and 11 more lines of observation log (442cca71, merged into the warder branch by 0c1670f8) | Revert; the proof is a probe | `0.162.` and the log are dropped. A version no primitive lists is probed by Agister itself on the first call (ADR-029, `gpt-6-luna` at effort `low`); the probe passed on codex-cli 0.162.0 on 2026-10-10. |
| CI: `ci.yml`, `agister-core.yml`, `warder-core.yml`, `scripts/tests/ci-workflow-paths.test.js` | Keep | A new module needs its CI. |
| `warder/AGENTS.md` (108 lines at #926) | Rewrite | 15 lines (#936): the design pointer, the module layout `arch_test.go` keeps, where logging lives, the check, `GOPRIVATE`. |
| `warder/README.md` (252 lines) | Rewrite | 47 lines (#936); `warder -h` now prints the usage, flags and exit codes. |

## What the nodes were given

| Input | Size | Marking |
|---|---|---|
| Implementer brief | 28 briefs, 75 KB, 1.0–7.3 KB each | One by one below. |
| Go guidance to implementers, `go-architecture` + `go-testing-seams` | 13 KB, every run | Needed: warder is Go. |
| Reviewer goal (the brief) | 2.1–7.7 KB, 4.0 KB on average | Needed: reviewers check the goal (ADR-023). |
| Reviewer prompt | 3.3–8.7 KB | Needed; the architecture and tests prompts carry their own Go sections. |
| Go guidance to reviewers | none in 18 of 20 rounds | Belonging elsewhere: reviewers followed the `warder/AGENTS.md` pointer to `.agister/prompts/go-architecture.md` (judge 20261009T141035Z-1c618e quotes it). Declared per node by LAB-161. |
| `warder/AGENTS.md` | 3–5.7 KB, loaded by every node | Duplicated: it restated `go-architecture.md`, what `arch_test.go` enforces, the verify and the README. The briefs put it there (below). |

Prompt bytes were not the cost. A reviewer run read 470–670K input tokens
against 6–16 KB of prompt and goal; the cost is the number of rounds.

### The briefs, one by one

Each brief was given to one implement run. Every brief is needed for its
task; the table marks what in it is not. No brief carries investigation
history: a fix brief names the review run it applies and lists the
owner's dated decisions, which the run needs.

| Brief | Bytes | Not needed |
|---|---|---|
| LAB-136 | 2645 | Duplicated: the Intent restates `go-architecture`'s separation rules, a given input. |
| LAB-136 round 1 | 3049 | Duplicated: one decision restates the typed-nil rule of `go-architecture`. |
| LAB-136 round 2, three variants | 4015, 4816, 4863 | Belongs elsewhere: done-when 6 and 8 write the rules `arch_test.go` keeps into `warder/AGENTS.md`. The orchestrator rewrote the brief twice after the owner's ruling; each variant ran once. |
| LAB-136 round 3 | 1670 | Belongs elsewhere: done-when 4 adds the package layout to `warder/AGENTS.md`. |
| LAB-137 | 3808 | Nothing. The `claude agents --json` sample observed on Claude Code 2.1.295 is the input the adapter parses; it is now in `internal/claude` and its test. One sentence restates typed nil. |
| LAB-137 round 1 | 1210 | Nothing. |
| LAB-138, LAB-139, LAB-140, LAB-141 | 2764, 3166, 2587, 2187 | Duplicated: a sentence in each Intent restates typed nil or the separation rules. |
| LAB-138, LAB-139, LAB-141 round 1 | 652, 1244, 2353 | Nothing. |
| LAB-142 | 5210 | Belongs elsewhere: done-when 8 puts a "Running" section into `warder/AGENTS.md`; usage is `warder -h` and the README (#936). |
| LAB-142 round 1, LAB-135 branch round 1 | 3353, 2105 | Nothing. |
| `pages-verify` | 1455 | **Unrelated**: it told a warder implement run to widen `agister/pages/tests/config.test.js` so the warder verify passed. The source of ad0b82e3. |
| LAB-143, round 1 | 3386, 2410 | Nothing. |
| LAB-159 | 1463 | Nothing. |
| LAB-158 goal | 7327 | Belongs elsewhere: the "Running" usage line in `warder/AGENTS.md`. The Sources section (1.9 KB of observations) is the task's material: the spec records it (`docs/agent-monitoring-mvp.md`). |
| LAB-157, round 1 | 2787, 980 | Nothing. |
| LAB-158 rounds 1–3 | 2593, 1204, 1407 | Nothing. |

Duplicated material is a sentence or two per brief. What cost more is
the six briefs that directed docs into `warder/AGENTS.md`: every later
node loaded them.

## The review rounds

The warder worktrees cost about $56 (`turn.cost_usd`): implement $27.52,
the five reviewers $24.74 (19 review runs recorded no cost), the judge
$3.57, the advisor $0.14. 16 judge runs ruled on 46 items:

| Ruling | Items |
|---|---|
| fix | 32 |
| owner (behaviour the brief left unstated, LAB-150) | 13 |
| waive | 1 |

Upheld fixes by reviewer: tests 24, adversarial 16, architecture 8,
intent 8, clarity 5; 10 fixes were raised by more than one reviewer. The
`warder` branch took 10 rounds, and rounds 9 and 10 still had 6 and 4
fixes. Every fix is in trunk.

Each fix, checked against its judge's trace and trunk:

| Kind | Fixes |
|---|---|
| Defect in ordinary use | 12 a closed stdout pipe killed warder by SIGPIPE; 22 the deadline record said a successful read expired; 27 a read cancelled in its last file operation was published |
| Defect in warder's own rule guards | 3 helpers in non-test files, 4 nested subtests, 6 interfaces declared from another type (the guards now live in `gokit/testdiscipline`) |
| Defect on malformed or impossible input | 2 a UTC year past 9999; 8, 17 invalid UTF-8; 21, 23 a typed-nil stderr, which only a test injects; 28, 30 a FIFO named as a lock or rollout |
| Defect since made moot | 18 the CI path filter for the deleted `implement_warder.yaml` (LAB-164); 26 a README example (README cut, #936) |
| Test gap, code correct | 1, 5, 7, 9, 10, 11, 13, 14, 15, 16, 19, 20, 24, 25, 29, 31, 32 |

Three of the 32 found a defect a user would meet; 17 were tests for code
that was already right. Six nodes per round on packages this small paid
mostly for test coverage, at about $1.75 a fix. Fix 32's test reads the
production constant `codexScanCap`, the pattern fixes 7 and 13 rejected.

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
4. **Proof is not by hand.** `codex.yaml`'s `verified` versions rested
   on hand observations kept as a comment (442cca71). Against the
   repository's `AGENTS.md` ("Verifying fixes": no verifying by hand).
   ADR-029 replaces the listing with a probe Agister runs itself.
5. **A check is not weakened to pass.** An implement run widened an
   Agister test to accept its own new setting (ad0b82e3), as its brief
   (`pages-verify`) told it to. Against the verify instruction ("do not
   weaken, skip or delete a check or a test"); the orchestrator wrote the
   weakening into the brief.

## How the merges got through

- **A project's PR could change Agister.** Nothing stopped #926 from
  carrying home's `codex.yaml`, an Agister test and the repository's
  settings. Now `scripts/pr-scope.js` fails such a PR in CI (#936).
- **The reviewers did not look.** The `codex.yaml` log passed four review
  rounds: clarity read it as a "why" comment, and tests saw no code
  change. The clarity and tests prompts now make both a finding (#937).
- **Not every commit was reviewed.** ad0b82e3, the widened Agister test,
  was in no review run's changed files.
- **A new runtime version needed an edit.** Codex calls were refused until
  someone listed the version, so one was listed on a hand observation.
  The probe (ADR-029) removes the edit.
