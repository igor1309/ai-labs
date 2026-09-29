# Deferred items 1, 2, 5, 6 and 8: each mutation undoes one fix, and the
# listed tests must fail with it. Run: scripts/revert-check.py <this file>
module: agister

# Item 2: verification per primitive.
[calls plan only from primitives verified for the runtime version]
file: internal/app/resolve.go
find: enforce.Make(res.effective.Permissions, verified, res.effective.Require
replace: enforce.Make(res.effective.Permissions, res.mapping, res.effective.Require
test: ./internal/app TestUnverifiedPrimitivesAreNeverGranted

[static check needs one version that covers the process]
file: internal/domain/settings/settings.go
find: \t\tverified, unverified := mapping.ForVersion(version)\n\t\t_, err := enforce.Make(effective.Permissions, verified,
replace: \t\t_, unverified := mapping.ForVersion(version)\n\t\tverified, _ := mapping.ForAnyVersion()\n\t\t_, err := enforce.Make(effective.Permissions, verified,
test: ./internal/domain/settings TestRequirementsNeedOneVersionThatCoversThem

[check --probe plans each process on the installed version]
file: internal/app/check.go
find: settings.PlanProblems(bundle, agent, identity.Version)
replace: []settings.Problem(nil)
test: ./internal/app TestCheckProbePlansEachProcessOnTheInstalledVersion

[a mapping-wide verified_versions is refused]
file: internal/domain/definition/documents.go
find: \tif _, ok := values["verified_versions"]; ok {
replace: \tif _, ok := values["verified_versions"]; ok && false {
test: ./internal/domain/definition TestMappingWideVerificationIsRefused
test: ./cmd/agister TestRefusedSettingsFieldsFailCheck

# Item 5: fields Agister would not enforce.
[resources and artifacts are refused]
file: internal/domain/definition/limits.go
find: \t\tif _, ok := values[field]; ok {
replace: \t\tif _, ok := values[field]; ok && false {
test: ./internal/domain/definition TestResearchPolicyParsesInPlace

# Item 6: no constraint that always passes.
[shipped examples carry no always-passing constraint]
file: examples/settings/policies/static-review.yaml
find: name: static-review\n
replace: name: static-review\nconstraints:\n  agent.model_family:\n    not_equal: evidence.candidate(input.candidate_revision).provenance.writer.model_family\n    on_unsatisfied: fail\n    on_unknown: pass\n
test: ./internal/domain/definition TestExamplesCarryNoConstraintThatAlwaysPasses

# Item 1: effects of a killed run are reaped.
[submitting a call starts a reap]
file: internal/app/background.go
find: \t\tr.Background.Start(ctx)\n
replace: 
test: ./internal/app TestSubmittingStartsAReap
test: ./cmd/agister TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted
test: ./cmd/agister TestNextCallReapsWhatAKilledRunLeftBehind

[the built client does not start reaps]
file: cmd/agister/main.go
find: return app.ReapOnSubmit{Client: host, Background: reaping}
replace: return host
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven
test: ./cmd/agister TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted

[the reaper reads the run store the calls write]
file: cmd/agister/main.go
find: Adopter: evidence,
replace: Adopter: fsruns.Store{Dir: config.Home},
test: ./cmd/agister TestBuiltClientSharesTheBackgroundReaper

[a refused submit starts no reap]
file: internal/app/background.go
find: \tif err == nil {\n\t\tr.Background.Start(ctx)
replace: \tif true {\n\t\tr.Background.Start(ctx)
test: ./internal/app TestARefusedSubmitStartsNoReap

[a reap does not delay the call]
file: internal/app/background.go
find: \tgo func() {\n\t\tdefer b.pending.Done()
replace: \tfunc() {\n\t\tdefer b.pending.Done()
test: ./internal/app TestABlockedReapDoesNotDelayTheCall

[reaps do not run concurrently]
file: internal/app/background.go
find: \tif b.running {\n
replace: \tif false {\n
test: ./internal/app TestReapsNeverRunConcurrently

[the reap is detached from the request's cancellation]
file: internal/app/background.go
find: \tctx = context.WithoutCancel(ctx)\n
replace: 
test: ./internal/app TestReapOutlivesTheRequestThatStartedIt

[the checkout is recorded before the runtime starts]
file: internal/app/calls.go
find: record.Effects = &run.Effects{Checkout: &run.Checkout{Repository: workspace.Repository, Dir: workspace.Dir}}
replace: _ = workspace.Repository
test: ./internal/app TestCallRecordsItsEffectsAsSoonAsTheyExist

[the process reference is recorded when it starts]
file: internal/app/calls.go
find: effects.Process = &run.Process{Ref: ref}
replace: _ = ref
test: ./internal/app TestCallRecordsItsEffectsAsSoonAsTheyExist

[a failed reap step still finishes the run]
file: internal/app/reap.go
find: \t\t\tif err != nil {\n\t\t\t\tfailures = append(failures, fmt.Sprintf("checkout
replace: \t\t\tif err != nil {\n\t\t\t\treturn\n\t\t\t\tfailures = append(failures, fmt.Sprintf("checkout
test: ./internal/app TestFailedReapStepsStillFinishTheRunWithTheError

[the supervisor's reference carries the token]
file: internal/adapters/runtime/supervisor/processes.go
find: return refPrefix + strconv.Itoa(group) + ":" + token
replace: return refPrefix + strconv.Itoa(group)
test: ./internal/adapters/runtime/supervisor TestRefRoundTrips

[the supervisor refuses a reference it did not make]
file: internal/adapters/runtime/supervisor/processes.go
find: \tif !ok {\n\t\treturn 0, "", fmt.Errorf(
replace: \tif !ok && false {\n\t\treturn 0, "", fmt.Errorf(
test: ./internal/adapters/runtime/supervisor TestReapLeavesAReferenceItDoesNotUnderstand

[a checkout that cannot be recorded is not ignored]
file: internal/app/calls.go
find: \t\tif err := handle.Update(record); err != nil {\n\t\t\trecord.Effects = nil\n
replace: \t\tif err := handle.Update(record); false && err != nil {\n\t\t\trecord.Effects = nil\n
test: ./internal/app TestCheckoutThatCannotBeRecordedIsReleasedAndTheCallRefused

[a process that cannot be recorded is reported to the runtime]
file: internal/app/calls.go
find: \tif err := s.handle.Update(*s.record); err != nil {\n\t\ts.record.Effects = previous
replace: \tif err := s.handle.Update(*s.record); false && err != nil {\n\t\ts.record.Effects = previous
test: ./internal/app TestProcessThatCannotBeRecordedIsReportedToTheRuntime

[the supervisor kills a group it could not record]
file: internal/adapters/runtime/supervisor/supervisor.go
find: \t\t_ = syscall.Kill(-pid, syscall.SIGKILL)\n\t\tsink.Event(run.SourceAgister, "PROCESS_RECORD_FAILED"
replace: \t\tsink.Event(run.SourceAgister, "PROCESS_RECORD_FAILED"
test: ./internal/adapters/runtime/supervisor TestGroupThatCannotBeRecordedIsKilled

[the supervisor notices when the first report fails]
file: internal/adapters/runtime/supervisor/supervisor.go
find: \trecorded := sink.ProcessStarted(Ref(pid, ""))\n
replace: \trecorded := error(nil)\n\t_ = sink.ProcessStarted(Ref(pid, ""))\n
test: ./internal/adapters/runtime/supervisor TestGroupThatCannotBeRecordedIsKilled

[the supervisor notices when the token report fails]
file: internal/adapters/runtime/supervisor/supervisor.go
find: \t\t\trecorded = sink.ProcessStarted(Ref(pid, token))\n
replace: \t\t\t_ = sink.ProcessStarted(Ref(pid, token))\n
test: ./internal/adapters/runtime/supervisor TestGroupThatCannotBeRecordedIsKilled

[the serial sink passes the recording error on]
file: internal/adapters/runtime/supervisor/supervisor.go
find: \treturn s.inner.ProcessStarted(ref)
replace: \t_ = s.inner.ProcessStarted(ref)\n\treturn nil
test: ./internal/adapters/runtime/supervisor TestGroupThatCannotBeRecordedIsKilled

[the logging sink passes the recording error on]
file: internal/adapters/logging/logging.go
find: \treturn err\n}\n\nfunc (s *countingSink) Raw
replace: \treturn nil\n}\n\nfunc (s *countingSink) Raw
test: ./internal/adapters/logging TestFailureToRecordTheProcessReachesTheRuntime

[an unrecorded process fails the turn]
file: internal/adapters/runtime/supervisor/supervisor.go
find: \tif evidence.RecordError == "" {
replace: \tif evidence.RecordError == "" || true {
test: ./internal/adapters/runtime/supervisor TestGroupThatCannotBeRecordedIsKilled

[claude-code fails the turn of an unrecorded process]
file: internal/adapters/runtime/claudecode/claudecode.go
find: if failed, ok := supervisor.RecordFailure(turn, evidence); ok {
replace: if failed, ok := supervisor.RecordFailure(turn, evidence); ok && false {
test: ./internal/adapters/runtime/claudecode TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays

[codex fails the turn of an unrecorded process]
file: internal/adapters/runtime/codex/codex.go
find: if failed, ok := supervisor.RecordFailure(turn, evidence); ok {
replace: if failed, ok := supervisor.RecordFailure(turn, evidence); ok && false {
test: ./internal/adapters/runtime/codex TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays

[the reaper kills the recorded group]
file: internal/adapters/runtime/supervisor/processes.go
find: syscall.Kill(-group, syscall.SIGKILL)
replace: syscall.Kill(-group, 0)
test: ./internal/adapters/runtime/supervisor TestReapKillsTheGroupOfTheRecordedProcess

[the reaper leaves a process it cannot identify]
file: internal/adapters/runtime/supervisor/processes.go
find: case err == nil && (token == "" || current != token):
replace: case err == nil && (token == "" || current != current):
test: ./internal/adapters/runtime/supervisor TestReapLeavesAProcessItCannotIdentify

[adopting takes the owner lock]
file: internal/adapters/fsruns/fsruns.go
find: \tif err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {\n\t\tlock.Close()\n\t\treturn nil, record,
replace: \tif err := error(nil); err != nil {\n\t\tlock.Close()\n\t\treturn nil, record,
test: ./internal/adapters/fsruns TestAdoptTakesOnlyAnAbandonedRun

[discard removes only agister checkouts]
file: internal/adapters/git/git.go
find: !strings.HasPrefix(filepath.Base(parent), "agister-checkout-")
replace: !strings.HasPrefix(filepath.Base(parent), "")
test: ./internal/adapters/git TestDiscardRefusesOtherDirectories

[discard prunes the repository's worktree list]
file: internal/adapters/git/git.go
find: run(ctx, repository, "worktree", "prune")
replace: run(ctx, repository, "status")
test: ./internal/adapters/git TestDiscardPrunesACheckoutThatIsGone

[the process token includes the command name]
file: internal/adapters/runtime/supervisor/processes.go
find: "lstart=,comm="
replace: "lstart="
test: ./internal/adapters/runtime/supervisor TestReapKillsTheGroupOfTheRecordedProcess

[the group is reported before its token is looked up]
file: internal/adapters/runtime/supervisor/supervisor.go
find: \trecorded := sink.ProcessStarted(Ref(pid, ""))\n
replace: \trecorded := error(nil)\n
test: ./internal/adapters/runtime/supervisor TestGroupIsReportedBeforeItsTokenIsKnown

[reaping is bounded by a timeout]
file: internal/app/reap.go
find: return context.WithTimeout(ctx, timeout)
replace: _ = timeout; return context.WithCancel(ctx)
test: ./internal/app TestReapingHasADeadlineByDefault

[the deadline is checked before adopting]
file: internal/app/reap.go
find: \t\t// The deadline may have arrived meanwhile: never adopt after it.\n\t\tif ctx.Err() != nil {
replace: \t\tif false {
test: ./internal/app TestNothingIsAdoptedAfterTheDeadline

[the deadline is checked before reading live runs]
file: internal/app/reap.go
find: \t\tif ctx.Err() != nil {\n\t\t\treturn\n\t\t}\n\t\t// Read before
replace: \t\t// Read before
test: ./internal/app TestReapingIsBounded

[a checkout a running run uses is not discarded]
file: internal/app/reap.go
find: \t\tcase slices.Contains(live, checkout.Dir):
replace: \t\tcase slices.Contains(live, "") :
test: ./internal/app TestACheckoutARunningRunUsesIsNotDiscarded

[live checkouts are those of owned runs]
file: internal/adapters/fsruns/fsruns.go
find: err != nil || state == run.StateRunning {
replace: err != nil || state == run.StateFinished {
test: ./internal/adapters/fsruns TestLiveCheckoutsAreThoseOfRunsSomeoneOwns

[discard removes only a directory named workspace]
file: internal/adapters/git/git.go
find: filepath.Base(dir) != "workspace" ||
replace: false ||
test: ./internal/adapters/git TestDiscardRefusesOtherDirectories

[discard removes only under the temp dir]
file: internal/adapters/git/git.go
find: resolved(filepath.Dir(parent)) != resolved(os.TempDir())
replace: false
test: ./internal/adapters/git TestDiscardRefusesOtherDirectories

# Item 8: one settings snapshot per operation; serialized writes.
[the gate builds the operation on live settings, not the checked snapshot]
file: internal/app/gate.go
find: layered := Snapshot(ctx, g.Definitions)
replace: layered := g.Definitions
test: ./internal/app TestGatedOperationUsesTheCheckedSettings

[a call resolves from live settings, not the snapshot it took at submit]
file: internal/app/calls.go
find: definitions := Snapshot(ctx, c.Definitions)
replace: definitions := c.Definitions
test: ./internal/app TestCallResolvesFromTheSettingsReadBeforeItsRunWasRecorded

[a call takes its snapshot after its run is recorded]
file: internal/app/calls.go
find: \tdefinitions := Snapshot(ctx, c.Definitions)\n\thandle, err := c.Recorder.Create(ctx, record)\n
replace: \thandle, err := c.Recorder.Create(ctx, record)\n\tdefinitions := Snapshot(ctx, c.Definitions)\n
test: ./internal/app TestCallResolvesFromTheSettingsReadBeforeItsRunWasRecorded

[the write lock is released before the digest compare]
file: internal/adapters/fsdefs/fsdefs.go
find: \ts.point("compare")
replace: \tunlock()\n\ts.point("compare")
test: ./internal/adapters/fsdefs TestWriteHoldsTheLockAtEachStep

[the write lock is released before the rename]
file: internal/adapters/fsdefs/fsdefs.go
find: \ts.point("rename")
replace: \tunlock()\n\ts.point("rename")
test: ./internal/adapters/fsdefs TestWriteHoldsTheLockAtEachStep

[the write lock is released before the exclusive create]
file: internal/adapters/fsdefs/fsdefs.go
find: \t\ts.point("create")
replace: \t\tunlock()\n\t\ts.point("create")
test: ./internal/adapters/fsdefs TestWriteHoldsTheLockAtEachStep

[the lock file sits among the documents and is listed]
file: internal/adapters/fsdefs/fsdefs.go
find: const lockName = ".write.lock"
replace: const lockName = "processes/.lock.yaml"
test: ./internal/adapters/fsdefs TestLockFileIsNeverListed

# Item 8: write scopes and the wiring use the operation's snapshots.
[the gate builds the global scope on the live global layer, not its snapshot]
file: internal/app/gate.go
find: client := g.Build(layered, Snapshot(ctx, g.Global))
replace: client := g.Build(layered, g.Global)
test: ./internal/app TestGatedWriteScopeChecksTheGlobalSnapshot

[the global write scope reads live settings]
file: cmd/agister/main.go
find: Check: checkerOn(globalOnly)
replace: Check: checkerOn(fsdefs.Layered{Global: global})
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[the project write scope reads live settings]
file: cmd/agister/main.go
find: Check: checkerOn(layered)})
replace: Check: checkerOn(definitions)})
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[calls read live settings, not the given source]
file: cmd/agister/main.go
find: \t\t\tCalls: &app.Calls{\n\t\t\t\tDefinitions: layered,
replace: \t\t\tCalls: &app.Calls{\n\t\t\t\tDefinitions: definitions,
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[inspection reads live settings, not the given source]
file: cmd/agister/main.go
find: Inspection: &app.Inspection{Definitions: layered,
replace: Inspection: &app.Inspection{Definitions: definitions,
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[settings read live settings, not the given source]
file: cmd/agister/main.go
find: Settings:   &app.Settings{Definitions: layered,
replace: Settings:   &app.Settings{Definitions: definitions,
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[the checker reads live settings, not the given source]
file: cmd/agister/main.go
find: Checker:    checkerOn(layered),
replace: Checker:    checkerOn(definitions),
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven
