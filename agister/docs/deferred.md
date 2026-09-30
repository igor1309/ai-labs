# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects of a killed CLI wait for the next call

- **Gap:** after `agister run` is killed with SIGKILL, its runtime process
  group and checkout stay until the next submitted call reaps them.
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

Against `origin/agister` (the PR's range):

- `architecture_review_codex`, run `20260930T130858Z-216be1`:
  - major: Include cost lookup in the turn’s timeout boundary (`agister/internal/adapters/runtime/codex/codex.go:187`)
  - minor: Define the cost collaborator by its role (`agister/internal/adapters/runtime/codex/codex.go:55`)
- `tests_review_codex`, run `20260930T130858Z-04fa42`:
  - major: Kill recorded command groups when readiness fails (`agister/cmd/agister/reap_test.go:199`)
  - minor: Register cleanup for every workflow with held turns (`agister/internal/app/workflow_test.go:614`)
  - minor: Remove elapsed-time verdicts from verification tests (`agister/cmd/agister/verify_loop_test.go:438`)
  - minor: Prove truncated output survives recording and repair (`agister/cmd/agister/verify_loop_test.go:764`)
  - minor: Test the new guards against Git diff configuration (`agister/internal/adapters/git/git.go:140`)
  - minor: Exercise successful ccusage invocation through the default runner (`agister/internal/adapters/runtime/codex/codex_test.go:221`)
- `adversarial_review_codex`, run `20260930T130858Z-8f42dc`:
  - major: Verification can depend on files omitted from the delivered patch (`agister/internal/app/verify.go:193`)
  - major: The ccusage subprocess bypasses bounded cancellation and cleanup (`agister/internal/adapters/runtime/codex/codex.go:69`)
  - major: Block the workflow when a child's final record cannot be persisted (`agister/internal/app/calls.go:329`)
  - major: A reaped continuation must invalidate the session-cost baseline (`agister/internal/domain/run/session.go:69`)
- `clarity_review_codex`, run `20260930T130858Z-6e937c`:
  - major: Preserve recorded decisions and report departures to the owner (`agister/docs/adr/001-agister-cli-architecture.md:232`)

Against trunk's merge-base (also covers #829 and #831):

- `architecture_review_codex`, run `20260930T124840Z-66d78a`:
  - major: Give the core a local composition root (`agister/cmd/agister/main.go:112`)
  - major: Remove private resolver implementation types from consumer contracts (`agister/internal/app/calls.go:46`)
  - major: Depend on cancellation and registration roles instead of Hosted (`agister/internal/app/runs.go:32`)
  - minor: Give the event sink its own narrow recording interface (`agister/internal/app/calls.go:928`)
- `tests_review_codex`, run `20260930T124840Z-e1af27`:
  - major: Run the settings integration test when its inputs change (`.github/workflows/ci.yml:141`)
  - major: Bound the cancellation test's startup wait (`agister/internal/app/calls_test.go:609`)
  - major: Remove elapsed-wall-time verdicts from verification tests (`agister/cmd/agister/verify_loop_test.go:467`)
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
