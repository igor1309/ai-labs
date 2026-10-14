# LAB-11 round-1 review fixes (workflow run 20260930T145702Z-1f6c47, judge 20260930T150223Z-25a597)

Fix each item as the judge ruled; the rulings are final. The ADR-003 item is done already (the forward reference is removed); do not touch ADRs. Use the quiet test commands from `agister/AGENTS.md`; report each with its exit code and final line, and list every file you changed.

## 1. Give an unsuccessful node content to prove its exclusion (major)

The trace is concrete. The failed and interrupted fixtures (workflow_test.go:658, 664, 705) carry no Text or Output. calls.go:457 keeps turn.Text on unsuccessful turns, and the new guard at workflow.go:146 is the only thing stopping lines 148–149 from copying it. With empty fixtures, the exact-entry assertion at workflow_test.go:683 passes whether or not the guard is there, so the change left its own new guard unproven.

**Action:** Give a failed turn non-empty Text (and Output). Assert that neither reaches its collection entry, so removing the completed-status guard fails the test.

## 2. Test the new normalization of nodes that never started (minor)

The case is concrete: in a three-node run, node one completes, recording node two fails (calls.go:726, 601), node three never starts (calls.go:633), and the new code at calls.go:659 marks node three failed/internal before it is serialized (workflow.go:142). storeSpy.Create always succeeds (workflow_test.go:208, 216), so no test reaches this code the change added.

**Action:** Add a failure hook to the recorder test double. Add a three-node test (one completes, recording two fails, three is skipped) that asserts the skipped node's persisted outcome and its collection entry, including no run and no content.

## 3. Keep the old meaning of stored blocked-barrier events on replay (minor)

The trace is complete. The base revision emits blocked BARRIER events with blocked_by but no incomplete field (calls.go:660 at fc182055). fsruns.go:259 and runs.go:47 pass stored events on unchanged, and `runs watch` replays them (cli.go:409). The new rendering at cli.go:592/621 reads every blocked_by event as 'no node completed' and prints empty parentheses, which misdescribes runs that already exist.

**Action:** When incomplete is absent in cli.go, keep the previous blocked_by-based description.

## 4. Nodes that never started, and the settings test's diagnostics (second opinion, gpt-6.1-sol)

Item on the normalization of nodes that never started: the test's store spy (`storeSpy.Create`, `agister/internal/app/workflow_test.go`) gets an optional hook that fails a create, chosen by `record.Parent.Node`, checked before recording anything; no production seam is needed. Tests: three fan-out nodes, the first completes, the second's create fails, the third never starts (empty run ID, `failed/internal`, the exact "earlier node" message); both incomplete nodes appear without output in the collection, the barrier passes and the join runs once. And: the first node's create fails, later nodes get that classification, the barrier blocks, no join. Synchronize on channels, no sleeps.

`completedRun` in `agister/cmd/agister/repo_settings_test.go` ignores the error reading `provider.jsonl`; report it in the failure message along with the node's result.
