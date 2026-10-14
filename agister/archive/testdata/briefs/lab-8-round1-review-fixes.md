# LAB-8 round-1 review fixes (workflow run 20260930T120522Z-aa77b6, judge 20260930T120948Z-238348)

Fix each item as the judge ruled; the rulings are final. Use the quiet test commands from `agister/AGENTS.md`; report each with its exit code and final line, and list every file you changed.

## 1. Honor terminal cancellation when the join finishes (major)

The trace gives one concrete sequence. At calls.go:307 the join prepares its completed record. The test's Finish hook (workflow_test.go:282) then cancels the workflow, and runs.go:63 accepts the cancel because the workflow's cancellation callback is still registered. calls.go:698 then sends the prepared record, and calls.go:668–672 finishes the workflow with the join's status without checking flow.cancelled. So Cancel reports success but the workflow ends completed, which contradicts ADR-003 rule 6 (docs/adr/003:103). The change introduced this finalization path.

**Action:** Serialize workflow finalization with flow.stop. When cancellation wins, end the workflow interrupted with class cancelled, and keep the child's own recorded outcome. Add a regression test that uses the existing onFinish hook to produce this interleaving.

## 2. Synchronize on the workflow receiving the second completion (major)

The trace shows that the test's wait point does not order the callbacks. The done channel closes inside Finish (workflow_test.go:289), but the completion callback is only sent after execute returns (calls.go:698). The test releases the first node after seeing only the done channel (workflow_test.go:491). The workflow records NODE_FINISHED in arrival order (calls.go:612, 591), so the order one, two is a valid schedule, and the assertion at workflow_test.go:504 rejects it. The test is flaky under a legitimate schedule.

**Action:** Before releasing node one, wait for the workflow's NODE_FINISHED event for node two, using a synchronized spy hook.

## 3. Retain every started node for failure cleanup (major)

The case is concrete. Under the hang scenario (workflow_test.go:119), each poll clears nodes (line 146) and returns at the first child without runtime effects (line 153), so a second child whose runtime has already started is never recorded. When the 15-second readiness guard fails the test (reap_test.go:29), cleanup covers only nodes kept from the last poll (line 135). That runtime runs in its own process group (supervisor.go:77) and loops forever (fakeclaude/main.go:64), so killing the CLI leaves it alive after the test. The change introduced this harness.

**Action:** During cleanup, rescan all child records and release each recorded effect independently, even when another child is incomplete.

## 4. Prove that unsuccessful join results become workflow results (major)

The trace shows that no test reaches calls.go:672 with a non-success join. The join script is always completed (workflow_test.go:328). The failure cases change only a fan-out node and assert that no join starts (lines 619, 625, 645), and the cancellation cases also require no join turn (lines 810, 841). The change newly propagates joined.Status and joined.Error at line 672, so this new behavior has no regression test.

**Action:** Add deterministic cases where the join returns failed/runtime_error and interrupted/timeout. In each, assert that the workflow's recorded status and class match the join's result.
