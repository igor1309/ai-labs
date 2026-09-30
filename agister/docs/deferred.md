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

## 3. A repository-settings test failed once with no cause found

- **Gap:** `TestRepositoryProcessesRunOnFakeRuntimes/workflow_code_review`
  failed once (2026-09-30, LAB-11's implement run) with "the runtime was
  not a fake" and an empty `provider.jsonl`; 12 reruns passed. The cause is
  unknown.
- **Trigger:** it fails again; the failure message then carries the read
  error and the node's result.
- **Done when:** the cause is found and a deterministic test covers it.
