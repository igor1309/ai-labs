# LAB-8 round-2 review fixes (workflow run 20260930T121452Z-da5467, judge 20260930T121747Z-ece90e)

Fix each item as the judge ruled; the rulings are final. Use the quiet test commands from `agister/AGENTS.md`; report each with its exit code and final line, and list every file you changed.

## 1. No test covers late cancellation through an already-captured callback, so the new ended guard goes untested (major)

The reviewer traces the whole case. Hosted.cancel captures the callback and unlocks before calling it (calls.go:222-225), so the workflow can finish in between (calls.go:501-509) and the new guard at workflow.go:38-39 then rejects the call. The test waits for the finished record (workflow_test.go:1079) before its second cancellation (1095). By then the hosted entry is gone, so that cancellation never reaches the guard or the callback's false result. The guard came with this change and nothing tests it. The finding asks for a test, not a new mechanism.

**Action:** Add a deterministic test that pauses a captured cancellation callback, lets the workflow finish first, then resumes the cancellation. Assert that it is refused and that the workflow's outcome is unchanged.

## 2. The ordering test leaves the held node and workflow running if the added wait fails (minor)

The failing sequence is traced step by step. The wait added at workflow_test.go:508 can expire and call t.Fatalf (441-442), which skips the release at line 512. The first node then stays blocked (140-145), because submission uses context.Background with no cancellation cleanup (407). The workflow in turn stays blocked waiting for that node (calls.go:632-635). The added wait introduced this failure path.

**Action:** Right after submission, register a cleanup that cancels the workflow and waits for it to complete, so failure paths don't leave the node and workflow goroutines running.
