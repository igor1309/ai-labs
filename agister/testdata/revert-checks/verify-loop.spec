# The verification loop (ADR-002 rules 3 and 5 to 10, LAB-7 slice B): a
# call of a process with verify completes only when its checks pass. Each
# mutation undoes one rule of the slice's brief, and the listed tests must
# fail with it.
# Run: scripts/revert-check.py <this file>
module: agister

# Rule 3: the command runs after a turn whose output validates.
[verification runs after a valid turn]
file: internal/app/calls.go
find: if fault == nil && res.process.Verify != nil {
replace: if false && res.process.Verify != nil {
test: ./cmd/agister TestVerifyFirstPassMakesNoRepairTurn
test: ./cmd/agister TestVerifyEvidenceForEveryAttempt
test: ./internal/app TestAVerifyingCallRunsItsCommandAfterTheTurn

# Rule 3: never after a failed or invalid turn.
[no verification after a failed or invalid turn]
file: internal/app/calls.go
find: if fault == nil && res.process.Verify != nil {
replace: if res.process.Verify != nil {
test: ./cmd/agister TestVerifyNeverRunsAfterAFailedOrInvalidTurn

# Rule 4: a repair resumes the call's own session in place.
[a repair resumes the call's session]
file: internal/app/verify.go
find: request.ResumeSessionID = v.session
replace: request.ResumeSessionID = ""
test: ./cmd/agister TestVerifyFailingRunIsRepairedInTheSameSessionAndCheckout
test: ./internal/app TestAFailedRunIsRepairedInTheCallsSession

# Rule 4: the repair turn is told the instruction, command, exit and output.
[a repair turn gets the failure]
file: internal/app/verify.go
find: request.Prompt = prompt.Repair(v.verify.Instruction, v.verify.Command, ended(ran), ran.Output)
replace: _ = prompt.Repair(v.verify.Instruction, v.verify.Command, ended(ran), ran.Output)
test: ./cmd/agister TestVerifyFailingRunIsRepairedInTheSameSessionAndCheckout
test: ./internal/app TestAFailedRunIsRepairedInTheCallsSession

# Rule 4: a repair turn is validated like any turn.
[a repair turn is validated]
file: internal/app/verify.go
find: fault = v.conclude(repair)
replace: fault = nil
test: ./cmd/agister TestVerifyRepairTurnThatFailsEndsTheNode

# Rule 4: a repair turn that reports another session fails.
[a repair turn must report the call's session]
file: internal/app/verify.go
find: repair.ProviderSessionID != v.session {
replace: repair.ProviderSessionID == "never" {
test: ./cmd/agister TestVerifyRepairTurnThatFailsEndsTheNode

# Rule 4: a turn that reports no session cannot be repaired.
[a turn without a session ends the node]
file: internal/app/verify.go
find: case v.session == "":
replace: case false:
test: ./cmd/agister TestVerifyTurnWithoutSessionCannotBeRepaired

# Rule 5: attempts are a limit of their own.
[the last attempt ends the loop]
file: internal/app/verify.go
find: case number >= v.verify.MaxAttempts:
replace: case number >= v.verify.MaxAttempts+1:
test: ./cmd/agister TestVerifyAttemptsRunOut

# Rule 5: each run is bounded by verify.timeout.
[a run is bounded by verify.timeout]
file: internal/app/verify.go
find: timeout := min(v.verify.Timeout, remaining)
replace: timeout := remaining
test: ./cmd/agister TestVerifyRunTimeout

# Rule 5: the call's timeout bounds every run.
[the call's timeout bounds a run]
file: internal/app/verify.go
find: timeout := min(v.verify.Timeout, remaining)
replace: timeout := v.verify.Timeout
test: ./cmd/agister TestVerifyCallTimeoutBoundsTheLoop

# Rule 5: the call's timeout bounds every repair turn.
[a repair turn gets the time left]
file: internal/app/verify.go
find: request.Timeout = remaining
replace: request.Timeout = v.request.Timeout
test: ./internal/app TestAFailedRunIsRepairedInTheCallsSession

# Rule 5: a timeout kills the command's whole process group.
[a timeout kills the group]
file: internal/adapters/runtime/supervisor/command.go
find: timedOut = true\n\t\t\tkill()
replace: timedOut = true
test: ./internal/adapters/runtime/supervisor TestCommandGroupIsKilled

# Rule 5: each repair turn receives only the remaining cost budget.
[a repair turn gets the budget left]
file: internal/app/verify.go
find: request.MaxCostUSD = budget
replace: request.MaxCostUSD = v.request.MaxCostUSD; _ = budget
test: ./cmd/agister TestVerifyUnknownCostBlocksRepair
test: ./internal/app TestAFailedRunIsRepairedInTheCallsSession

# Rule 5: an unknown cost under a cost limit blocks repair.
[an unknown cost blocks repair]
file: internal/app/verify.go
find: if spent.Source == run.CostUnknown || spent.USD == nil {
replace: if false {
test: ./cmd/agister TestVerifyUnknownCostBlocksRepair

# Rule 6: a run never repeats on content already checked.
[no run on content already checked]
file: internal/app/verify.go
find: if earlier := slices.Index(checked, identity); earlier >= 0 {
replace: if earlier := slices.Index(checked, identity); earlier >= 99 {
test: ./cmd/agister TestVerifyStopsWithoutProgress

# Rule 6: every identity checked earlier counts, not only the last (A, B, A).
[every checked content counts]
file: internal/app/verify.go
find: checked = append(checked, identity)
replace: checked = []string{identity}
test: ./cmd/agister TestVerifyStopsWithoutProgress

# Rule 6: the same exit status and output as the previous run ends the loop.
[the same failure twice ends the loop]
file: internal/app/verify.go
find: case previous != nil && sameExit(previous.Exit, ran.Exit) && previous.Output.SHA256 == ran.Output.SHA256:
replace: case false:
test: ./cmd/agister TestVerifyStopsOnTheSameFailureTwice

# Rule 7: a run that changes the content fails whatever its exit status.
[a run that changes the checkout fails]
file: internal/app/verify.go
find: ran.Passed = ran.Exit.Code != nil && *ran.Exit.Code == 0 && ran.After == ""
replace: ran.Passed = ran.Exit.Code != nil && *ran.Exit.Code == 0
test: ./cmd/agister TestVerifyRunThatChangesTheCheckoutFails

# Rule 7: completion needs a capture that reproduces the passing content.
[the capture must rebuild the content that passed]
file: internal/app/calls.go
find: err == nil && rebuilt != verified {
replace: err == nil && false {
test: ./cmd/agister TestVerifyCaptureReproducesThePassingContent

# Rule 7: the content identity covers untracked files that are not ignored.
[untracked files are content]
file: internal/adapters/git/git.go
find: "add", "--all", "--", "."
replace: "add", "--update", "--", "."
test: ./internal/adapters/git TestChangesCoverEverythingSinceTheRevision

# Rule 8: usage and cost sum every turn.
[usage and cost sum every turn]
file: internal/app/calls.go
find: totals := run.Sum(turns)
replace: totals := run.Sum(turns[len(turns)-1:])
test: ./cmd/agister TestVerifyFailingRunIsRepairedInTheSameSessionAndCheckout
test: ./cmd/agister TestVerifyRepairTurnThatFailsEndsTheNode

# Rule 8: the output is the latest turn's.
[the output is the latest turn's]
file: internal/app/calls.go
find: result.Output = record.Turn.Output
replace: result.Output = turns[0].Output
test: ./cmd/agister TestVerifyFailingRunIsRepairedInTheSameSessionAndCheckout

# Rule 9: every attempt is recorded before the next turn starts.
[an attempt is recorded before the repair turn]
file: internal/app/verify.go
find: // Every checked state can be rebuilt before the next turn changes it.\n\t\tif err := v.save(attempt); err != nil {
replace: // Every checked state can be rebuilt before the next turn changes it.\n\t\tif err := error(nil); err != nil {
test: ./cmd/agister TestVerifyEvidenceForEveryAttempt

# Rule 9: the diff each turn made is kept as an artifact.
[each turn's changes are kept]
file: internal/app/verify.go
find: fmt.Sprintf("attempt-%d.patch", number), from, identity)
replace: fmt.Sprintf("attempt-%d.patch", number), from, from)
test: ./cmd/agister TestVerifyEvidenceForEveryAttempt

# Rule 9: the output's digest is of the whole output.
[the output digest covers everything]
file: internal/adapters/runtime/supervisor/command.go
find: b.digest.Write(p)
replace: b.digest.Write(nil)
test: ./internal/adapters/runtime/supervisor TestCommandRunsWithBoundedOutput
test: ./cmd/agister TestVerifyEvidenceForEveryAttempt

# Rule 9: the output kept is bounded to its head and tail.
[the output is bounded]
file: internal/adapters/runtime/supervisor/command.go
find: if len(b.tail) > b.bound {
replace: if len(b.tail) > b.bound*100 {
test: ./internal/adapters/runtime/supervisor TestCommandRunsWithBoundedOutput

# Rule 10: the command's process group is on record while it runs.
[the command's group is recorded]
file: internal/app/verify.go
find: effects.Command = &run.Process{Ref: ref}
replace: effects.Command = nil
test: ./cmd/agister TestVerifyCancellationKillsTheCommandGroup
test: ./cmd/agister TestNextCallReapsAKilledRunsVerifyCommand
test: ./internal/app TestAVerifyingCallRunsItsCommandAfterTheTurn

# Rule 10: cancellation kills the command's group.
[cancellation kills the group]
file: internal/adapters/runtime/supervisor/command.go
find: cancelled = true\n\t\t\tkill()
replace: cancelled = true
test: ./internal/adapters/runtime/supervisor TestCommandGroupIsKilled
test: ./cmd/agister TestVerifyCancellationKillsTheCommandGroup

# Rule 10: what a command leaves in its group is killed when it exits.
[leftovers are killed after an exit]
file: internal/adapters/runtime/supervisor/command.go
find: \t_ = syscall.Kill(-pid, syscall.SIGKILL)\n\tmu.Unlock()\n\tclose(exited)
replace: \tmu.Unlock()\n\tclose(exited)
test: ./internal/adapters/runtime/supervisor TestCommandGroupIsKilled

# Rule 10: a group that cannot be recorded is killed at once.
[an unrecorded group is killed]
file: internal/adapters/runtime/supervisor/command.go
find: result.Error = recorded.Error()\n\t\t_ = syscall.Kill(-pid, syscall.SIGKILL)
replace: result.Error = recorded.Error()
test: ./internal/adapters/runtime/supervisor TestUnrecordedCommandIsKilled

# Rule 10: the reap after a killed CLI kills the command's group.
[the reap kills the command's group]
file: internal/app/reap.go
find: {{"process", effects.Process}, {"command", effects.Command}}
replace: {{"process", effects.Process}}
test: ./internal/app TestAbandonedVerifyCommandIsReaped
test: ./cmd/agister TestNextCallReapsAKilledRunsVerifyCommand

# Wiring: the composition root runs verification commands through the
# command runner.
[the built calls run the verification command through the wired role]
file: cmd/agister/main.go
find: app.NewVerifier(git.Workspaces{}, supervisor.Commands{}, system.Clock{})
replace: app.NewVerifier(git.Workspaces{}, struct{ app.VerifyCommands }{}, system.Clock{})
test: ./cmd/agister TestVerifyDeclarationEndToEnd

# Review fix 1: a repair that reports no session fails, though its content
# would pass.
[a repair that reports no session fails]
file: internal/app/verify.go
find: if fault == nil && repair.ProviderSessionID != v.session {
replace: if fault == nil && repair.ProviderSessionID != "" && repair.ProviderSessionID != v.session {
test: ./cmd/agister TestVerifyRepairTurnThatFailsEndsTheNode

# Review fix 5: a passing attempt that cannot be recorded does not complete
# the node.
[a passing attempt that cannot be recorded fails the call]
file: internal/app/verify.go
find: // The node completes only once the passing attempt is recorded.\n\t\t\tif err := v.save(attempt); err != nil {
replace: // The node completes only once the passing attempt is recorded.\n\t\t\tif err := v.save(attempt); err != nil && false {
test: ./internal/app TestAnAttemptThatCannotBeRecordedStopsTheCall

# Review fix 5: a failed attempt that cannot be recorded is not repaired.
[a failed attempt that cannot be recorded stops the repair]
file: internal/app/verify.go
find: // Every checked state can be rebuilt before the next turn changes it.\n\t\tif err := v.save(attempt); err != nil {
replace: // Every checked state can be rebuilt before the next turn changes it.\n\t\tif err := v.save(attempt); err != nil && false {
test: ./internal/app TestAnAttemptThatCannotBeRecordedStopsTheCall

# Review fix 6: a cost limit already spent, exactly or beyond, blocks repair.
[a spent cost budget blocks repair]
file: internal/app/verify.go
find: if left <= 0 {
replace: if false {
test: ./cmd/agister TestVerifySpentBudgetBlocksRepair

# Verification finding 7: files the revision tracks stay content though
# they match .gitignore.
[tracked files stay content whatever the ignore rules]
file: internal/adapters/git/git.go
find: runWith(ctx, dir, env, nil, "read-tree", revision); err != nil {\n\t\t\treturn err\n\t\t}\n\t\tif _, err := runWith(ctx, dir, env, nil, "add"
replace: runWith(ctx, dir, env, nil, "read-tree", "--empty"); err != nil {\n\t\t\treturn err\n\t\t}\n\t\tif _, err := runWith(ctx, dir, env, nil, "add"
test: ./internal/adapters/git TestTrackedIgnoredFilesStayContent
