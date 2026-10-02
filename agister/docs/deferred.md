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

## 3. A reap test leaves a run record behind

- **Gap:** `TestNextCallReapsAKilledRunsVerifyCommand`
  (`cmd/agister/reap_test.go:241`) fails about 1 run in 10, on trunk
  `c5cd41fd` as on the LAB-49 branch: the temporary-directory check finds
  `<home>/runs/<id>/record.json` written after the test's cleanup removed
  the home (observed 2026-10-02, `go test -count=10 -run` that test).
- **Trigger:** the next change to the reap path or its tests, or a
  full-suite run it fails.
- **Done when:** the test passes `-count=20` with no leftover, and the
  writer of that record is ended or waited for before the cleanup.

## 4. Callers have no Agister usage skill

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

## 5. The Codex implementer cannot run the full check

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

## 6. Resolver builds the Calls and Inspection result types

- **Gap:** `Resolver.Snapshot` builds `callResolution` around a concrete
  `*Resolver`, and `NewClient` passes the Resolver straight to its
  consumers, against ADR-001 rule 14. The prompt loop added in LAB-50
  follows the same pattern.
- **Trigger:** the next change to the Resolver, Calls and Inspection
  boundary, or a refactor issue of its own.
- **Done when:** the Resolver exposes its own result API, `NewClient`
  builds the interface-based Calls and Inspection adapters, and those are
  tested with stand-ins.
