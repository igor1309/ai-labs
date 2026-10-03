# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects of a killed CLI wait for the next call

- **Gap:** after `agister run` is killed with SIGKILL, its runtime process
  group, checkout, and verification command group and clean copy stay
  until the next submitted call reaps them.
- **Trigger:** the service (ADR-001 rule 16).
- **Done when:** the service reaps on start and periodically.

## 2. Review findings no judge has ruled on

- **Gap:** two whole-branch `code_review` runs on 2026-09-30 produced
  reviews but no rulings. Against `origin/agister` (workflow run
  `20260930T130858Z-4b4972`), all four reviewers completed and the judge
  hit Claude's session limit. Against trunk's merge-base (run
  `20260930T124840Z-762d82`), the adversarial reviewer timed out and the
  barrier stopped the judge (LAB-11). Each finding's case and trace are
  in its run's record.
- **Trigger:** the judge can rule on recorded reviews (LAB-11), or the
  next `code_review` of this code.
- **Done when:** every finding below has a ruling and each fix ruling is
  applied.
- **Moved:** the code majors are Multica issues LAB-13 to LAB-24 (the
  elapsed-time minor went with LAB-24); what follows is what is left.

Against `origin/agister` (the PR's range):

- `architecture_review_codex`, run `20260930T130858Z-216be1`:
  - minor: Define the cost collaborator by its role (`agister/internal/adapters/runtime/codex/codex.go:55`)
- `tests_review_codex`, run `20260930T130858Z-04fa42`:
  - minor: Register cleanup for every workflow with held turns (`agister/internal/app/workflow_test.go:614`)
  - minor: Prove truncated output survives recording and repair (`agister/cmd/agister/verify_loop_test.go:764`)
  - minor: Test the new guards against Git diff configuration (`agister/internal/adapters/git/git.go:140`)
  - minor: Exercise successful ccusage invocation through the default runner (`agister/internal/adapters/runtime/codex/codex_test.go:221`)
- `clarity_review_codex`, run `20260930T130858Z-6e937c`:
  - major: Preserve recorded decisions and report departures to the owner (`agister/docs/adr/001-agister-cli-architecture.md:232`)

Against trunk's merge-base (also covers #829 and #831):

- `architecture_review_codex`, run `20260930T124840Z-66d78a`:
  - minor: Give the event sink its own narrow recording interface (`agister/internal/app/calls.go:928`)
- `tests_review_codex`, run `20260930T124840Z-e1af27`:
  - minor: Clean up cached fake-runtime build directories (`agister/internal/adapters/runtime/runtimetest/runtimetest.go:37`)
  - minor: Assert raw-output contents and ordering (`agister/internal/adapters/runtime/runtimetest/runtimetest.go:172`)
  - minor: Register cleanup before asserting on blocked workflows (`agister/internal/app/workflow_test.go:614`)
- `clarity_review_codex`, run `20260930T124840Z-ee2b26`:
  - major: Preserve existing recorded instructions (`prompts/code-review-architecture.md:43`)

## 3. Check reports "needs a newer agister" as a class of its own

- **Gap:** a problem naming something this binary does not know is only
  marked (`unknown` in `--json`) and followed by a one-line hint; nothing
  sums it up as one verdict, and a settings folder this binary does not
  know is still skipped without a word (LAB-52 took the lighter option).
- **Trigger:** pages or a script reads the check report, or an unknown
  folder hides a mistake that no field or source points at.
- **Done when:** check reports these problems as their own class with one
  verdict line naming the installed binary, and lists unknown settings
  folders.

## 4. Settings declare the binary they need

- **Gap:** settings cannot say which agister they need, so an old binary
  can only guess that they are newer than it (LAB-52).
- **Trigger:** agister gets tagged releases with ordered versions.
- **Done when:** settings may declare a minimum version, and check refuses
  them on an older binary, naming both versions.

## 5. Callers have no Agister usage skill

- **Gap:** an agent calling Agister from another project has only
  `--help` and the README. On 2026-10-02 the iOS caller (DBSNEW-17564)
  had no skill to read: it launched from the config repository, so a
  `HEAD` default resolved there, and it continued a run that held no
  changes (LAB-54). ADR-013 makes continuation carry the changes, but where
  to launch, pinning the revision and applying a finished run's patch are
  still the caller's to know.
- **Trigger:** the next project to call Agister from its own agents, or
  the next caller mistake of this kind.
- **Done when:** Agister ships a caller skill (or a template a project
  adopts) covering where to launch, pinning the revision, `--continue`,
  and applying `changes.patch`.

## 6. The Codex implementer cannot run the full check

- **Gap:** in `implement_codex` runs `20261002T131055Z-5e6f2e` and
  `20261002T133203Z-ca391d` (LAB-54), the full check failed inside the
  agent's sandbox: process-inspection and local-serving tests are denied
  (`/bin/ps: operation not permitted`). The agent reported targeted
  packages instead, and the caller had to run the full check.
- **Trigger:** the next `implement_codex` run whose change touches those
  packages, or a change to the Codex permission mapping.
- **Done when:** the Codex implementer can run the full check, or the
  process's verification runs it outside the agent's sandbox and its
  result is what the call reports.

## 7. Resolver builds the Calls and Inspection result types

- **Gap:** `Resolver.Snapshot` builds `callResolution` around a concrete
  `*Resolver`, and `NewClient` passes the Resolver straight to its
  consumers, against ADR-001 rule 14. The prompt loop added in LAB-50
  follows the same pattern.
- **Trigger:** the next change to the Resolver, Calls and Inspection
  boundary, or a refactor issue of its own.
- **Done when:** the Resolver exposes its own result API, `NewClient`
  builds the interface-based Calls and Inspection adapters, and those are
  tested with stand-ins.

## 8. The in-process test harness runs on real clocks and a detached reaper

- **Gap:** `inProcess` / `composeInProcess` in `cmd/agister/main_test.go`
  start from the production composition, which keeps `system.Clock{}`
  and the real reaper with a 30 s deadline, and discard the reaper's
  `Wait` handle. Every test built on it inherits both (code_review
  `20261003T090214Z-2d9680`, LAB-59; again `20261003T130421Z-aa12ef`,
  LAB-64).
- **Trigger:** the next change to the cmd/agister in-process harness, or
  a test that observes reaper timing.
- **Done when:** the composition accepts a fake clock and a fake reaper,
  and any background worker it keeps is awaited through
  `t.Cleanup(Wait)`.

## 9. Settings YAML files read only their first document

- **Gap:** the shared `parseYAML` (`internal/domain/definition/yaml.go`)
  reads the first YAML document and ignores the rest, so a process,
  workflow or other YAML settings file with a second document drops it
  silently. LAB-59 made `blocks.yaml` require exactly one document
  (`parseOneYAML`, code_review `20261003T093630Z-b601a0`); the other kinds
  still use `parseYAML`.
- **Trigger:** the next change to YAML settings parsing, or a settings
  file found with a second document.
- **Done when:** every YAML settings kind rejects more than one document,
  with a parser test per kind.

## 10. Pages does not know optional prompts

- **Gap:** pages reads settings itself (`pages/config.js`) and marks a
  prompt that neither layer has as missing: "Agister refuses the call"
  (`pages/page.js`). It does not read `optional: true` (ADR-019), so it
  flags a missing optional prompt that `check` and calls accept (LAB-64).
- **Trigger:** the next change to how pages shows a process's prompts, or
  the first repository that leaves an optional prompt out.
- **Done when:** pages shows a missing optional prompt as optional and not
  found, matching `process show`, with a test.
