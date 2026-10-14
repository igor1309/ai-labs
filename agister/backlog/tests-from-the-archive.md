---
date: 2026-10-14
model: claude-opus-5-5
description: "Tests for the new Agister, from the archived implementation's integration tests"
---

# Tests for the new Agister, from the archive's integration tests

Source: the 284 `Test*` functions in `agister/archive/cmd/agister/*_test.go`,
each named by its function, whose doc comment states the behaviour.
Each behaviour below names the tests it comes from. The part is the one in
`docs/architecture/top-level.md` that should own the test; "e2e" means
through the built binary, as today.

Marked **changed**: the architecture changes the behaviour the archive tests.

## 1. End to end, through the binary

- A fresh home: only `init` and help work; `init` asks before writing, `--force` names what it replaces. (TestFreshHomeNeedsInit, TestInitAsksBeforeWriting)
- `version` and `--version` name the build: module version, revision, `+dirty`, commit time. (TestVersion, TestBinaryNamesItsBuild)
- Closing the terminal, Ctrl-C and kill cancel the call. (TestShutdownSignalsCancel)
- A log that cannot be written fails setup; the log rotates at 5 MB and keeps three. (TestAnUnusableLogFailsAtSetup, TestTheLogIsKeptWithinTheShippedCap)
- One agent call end to end; one workflow of one call is one run naming workflow, process and agent. (TestAgentCallEndToEnd, TestAWorkflowOfOneCallIsOneRunOfItsProcess)
- The fan-out/join example end to end; a timed-out node does not stop the join, which gets its status and class. (TestExampleWorkflowEndToEnd, TestExampleWorkflowJoinsWithoutATimedOutNode)
- A domain verdict is output, not status. (TestVerdictIsOutputNotStatus)
- Cancel through the contract interrupts the runtime and releases the worktree; the run ends interrupted. (TestCancelThroughTheContract)
- A run survives settings broken mid-run: still cancellable, observable, inspectable. (TestRunSurvivesSettingsBrokenMidRun)
- A continuation resumes the earlier session in place and costs what it added. (TestContinuationEndToEnd)
- A call works in the caller's worktree: turns and verification there, changes stay, `changes.patch` recorded, no checkout made. (TestAnInPlaceCallWorksInTheCallersWorktree, TestTheCompositionLendsAnInPlaceCallTheCallersWorktree, TestWorkspaceChangesAreKept)
- A run whose folder cannot be made fails, makes no run, and is logged. (TestARunThatCannotBeRecordedIsLogged)
- The shipped examples pass check. (TestShippedExamplesPassCheck)
- New kinds of work, contracts and permissions need no code. (TestSettingsOnlyExtension)
- **changed** Settings that cannot be resolved: stderr, exit code, no run recorded (rule 4). Today they are recorded. (TestRefusedCallIsRecorded, TestACallOnABrokenMappingIsRefused, TestComposedSettingsAreVerified, TestARepositoryBlocksAnAgentHomeAllows)
- A refusal after resolution (held worktree, admission) is recorded. (TestAnInPlaceCallRefusesAWorktreeItCannotAdmit)
- install and restore through the CLI: asks, says how to restore, `--json` prints the plans. (TestInstallAndRestoreThroughTheCLI, TestInstallAndRestorePrintJSON)

## 2. `settings/layout`

- Layers for a launch directory: home, repository, nearest project; the project has no say at the root. (TestACallRunsTheSettingsComposedForItsLaunchDirectory, TestProjectSettingsAddToGlobal)
- Read commands take `--dir`, relative to the launch directory. (TestTheReadCommandsTakeTheLaunchDirectory)
- No fourth layer: a second `.agister` below the project's makes it invalid. (TestASecondSettingsDirectoryBelowTheProjectsStopsWhatIsLaunchedThere)
- `blocks.yaml` in a project layer invalidates it; in home it is a problem that blocks nothing. (TestBlocksInAProjectLayerStopWhatIsLaunchedThere, TestHomeBlocksNothing)
- A `policies/` file is a layer problem that stops what is launched under it. (TestCheckReportsAFileInALayersPolicies)
- A `.agister` that cannot be used fails every command and is logged. (TestUnusableProjectSettingsFail)
- `layer.yaml` prompt folders: lookup order, unreferenced files ignored, an unusable `layer.yaml` stops its layer, none in home. (TestALayerFindsItsPromptsInTheFoldersItsLayerFileLists, TestAnUnreferencedLibraryFileDoesNotReplaceAnInventoryPrompt, TestALayerFileThatCannotBeUsedStopsEveryCommandUnderItsLayer)
- A directory or dangling link at a prompt path is a broken prompt, not a missing one; an unlistable folder stops every command. (TestADirectoryAtAPromptsPathRefusesTheCall, TestADanglingLinkAtAPromptsPathRefusesTheCall)
- A missing document is expected in the nearest layer, and its path named. (TestCheckNamesWhereAMissingDocumentIsExpected)
- A `.agister` that is home itself is no layer. (LAB-255's goal; no archive test)

## 3. `settings/documents`

Format:
- Fields once accepted and ignored are refused. (TestRefusedSettingsFieldsFailCheck)
- An unknown field, adapter, input source or newer schema is marked as "may need a newer binary"; a wrong value of a known field is not. (TestCheckMarksWhatThisBinaryDoesNotKnow, TestSettingsNewerThanTheBinaryAreNamedOnEveryRefusal)
- A binary file in a document's place is one problem. (TestUnreadableServiceSettingsFailCheck)
- The pre-ADR-030 forms (process names an agent, agent holds a session, node names no agent) are problems that say what to do. (TestCheckReportsTheFormBeforeAWorkflowBoundAProcessToAnAgent)

Layering:
- Field by field, nearest wins; the record and check name each layer's file and the fields it gave. (TestProjectOverridesAreNoted, TestCheckChecksTheComposedDocument, TestShowAndTheTreeNameEachFieldsLayer)
- A layer sets one field alone: `call.agent`, `join.agent`, `session`. (TestALayerSetsTheCallsAgentAlone, TestALayerSetsTheJoinsAgentAlone, TestAProcessThatSetsSessionSaysWhetherItsRunsAreContinued)
- `extends`: the base composed first, the process over it; origins name the giving process; the nearest whole file names the base; a broken process keeps its base a base. (TestAProcessRunsOverItsBaseAsItsLayersComposeIt, TestEachFieldNamesTheProcessWhoseFileGaveIt, TestTheNearestWholeProcessNamesItsBase, TestABrokenProcessKeepsItsBaseABase)
- A repository verification replaces a global one of the same name. (TestARepositoryVerificationReplacesAGlobalOne)

Kinds:
- What an extending process cannot do; a base is not run. (TestWhatAnExtendingProcessCannotDo, TestABaseIsNotRun)
- A process that names a policy is a problem. (TestCheckReportsAProcessThatNamesAPolicy)
- A process may be read-write. (TestAProcessMayBeReadWrite)
- A fresh-only process whose verification repairs is a problem. (TestCheckReportsAFreshOnlyProcessThatRepairs)
- A skill folder with a second file, an unreadable prompt: problems of their own document. (TestASkillFolderWithASecondFileIsAProblemOfItsOwn, TestAnUnreadablePromptIsAProblemOfItsOwn)
- A file in `prompts/` read through `source: file` keeps working whatever its name. (TestAFileInPromptsReadThroughSourceFileKeepsWorking)

## 4. `settings/resolve`

- A broken document refuses only what uses it, naming document, path, problem and chain. (TestAnUnusedBrokenMappingRefusesNothing, TestACallOnABrokenMappingIsRefused, TestAnInvalidRepositoryVerificationFailsCheck)
- A missing prompt, verification or skill refuses only what names it, naming the expected paths. (TestAPromptInNeitherLayerIsAProblemOfTheProcess, TestAVerificationInNeitherLayerRefusesOnlyTheProcessNamingIt, TestASkillInNeitherLayerIsAProblemOfWhatNamesIt)
- Blocks on an agent, process, runtime mapping, workflow, base, and on a broken document as written; a broken or unreadable `blocks.yaml` stops every command but install and restore. (TestARepositoryBlocksAnAgentHomeAllows, TestBlocksOnAProcessAndARuntimeMapping, TestABlockOnAWorkflow, TestABlockOnABaseRefusesItsProcesses, TestABlockOnABrokenDocumentBlocksItAsWritten, TestABrokenBlockListStopsEveryCommandButInstallAndRestore)
- Limits composed against the service's ceilings. (TestComposedSettingsAreVerified)
- A node binds its process to an agent; a process alone is refused, naming the workflows that bind it. (TestANodeBindsItsProcessToAnAgent)
- Permission plans from runtime facts: what a binding withholds is listed; a withheld `tools.require` refuses that workflow alone; a cost or tool-command limit the runtime cannot enforce refuses. (TestCheckAndWorkflowShowListWhatEachBindingWithholds, TestABindingRefusedForARequiredPermissionShowsWhatElseItWithholds, TestABindingTheSettingsRefuseShowsWhatElseItWithholds, TestABindingWithholdingARequiredPermissionRefusesItsWorkflowAlone, TestCheckRefusesABindingWhoseRuntimeCannotEnforceItsCostLimit, TestOpenCodeCallUnderACostLimitIsRefused, TestOpenCodeCallUnderAToolCommandLimitIsRefused)
- Per runtime, the tools a grant needs (host.write beside repository.write, skill tool needs host.read, Bash needs network), and version evidence warns. (TestExampleClaudeCodeSettingsGrantTheVerifiedWriteTools, TestExampleClaudeCodeCallRequiringWritesWithoutHostWritesIsRefused, TestExamplePiSettingsGrantTheVerifiedWriteToolsAndBash, TestExamplePiCallRequiringWritesWithoutHostWritesIsRefused, TestOpenCodeCallWithoutTheSkillToolIsRefused, TestExamplePiCallWithoutASkillToolIsRefused, TestImplementWithoutNetworkIsRefusedForProcessExecute, TestExampleOpenCodeSettingsWarnWithoutVersionEvidence, TestExampleOpenCodeSettingsWarnForUnverifiedRequiredTools, TestHomePiSettingsVerify102AndKeep085)
- A prompt is found in the settings, not the caller's directory; guidance prompts each from the nearest layer, in order, with digests. (TestAPromptIsFoundInTheSettingsNotTheCallersDirectory, TestEachGuidancePromptIsGivenFromTheNearestLayerThatHasIt)
- A global process verifies with the repository's verification. (TestAGlobalProcessVerifiesWithTheRepositorysVerification)
- A workflow's nodes resolve against the run's layers. (TestAWorkflowsNodesResolveAgainstTheRunsLayers)
- Skills found repository over home, recorded by digest. (TestACallsSkillsAreFoundInTheSettingsAndGivenToClaudeCode)

## 5. `settings/check`

- check lists every problem with what it refuses; the tree view; `--json`. (TestCheckAndWorkflowShowListWhatEachBindingWithholds, TestCheckChecksTheComposedDocument, TestShowAndTheTreeNameEachFieldsLayer)
- The newer-binary hint on check, a refused call, a refused install and a refused agent. (TestSettingsNewerThanTheBinaryAreNamedOnEveryRefusal, TestAnInstallOfNewerSettingsIsNamedOnItsRefusal, TestAnAgentOnANewerRuntimeIsNamedOnItsRefusal)
- Inspect: process, workflow and agent list and show, with layers, provenance and withheld permissions. (TestShowAndTheTreeNameEachFieldsLayer, TestEachFieldNamesTheProcessWhoseFileGaveIt)

## 6. `settings/home`

- install: per-document plan with diffs; identical settings do nothing; backup before writing; refuse a result that fails check; the yes binds the inventory; writes under the lock; a failed backup writes nothing; failure logged; invalid names; a document home cannot read; keeps five backups; repairs broken settings; refuses a symlink; no blocks installed. (TestInstallPlansEachDocument … TestInstallRefusesASymbolicLink, 20 tests; TestInstallDoesNotInstallBlocks)
- restore: undoes an install, one stopped halfway, puts back a process whose base is gone; refuses a changed state and a tampered backup. (TestRestoreUndoesAnInstall, TestRestoreUndoesAnInstallStoppedHalfway, TestRestorePutsBackAProcessWhoseBaseIsGone, TestRestoreRefusesAStateChangedSinceThePlan, TestRestoreRefusesATamperedBackup)
- Skills in install and restore. (TestInstallTakesASkillAndRestoreUndoesIt, TestRestoreRemovesTheFolderAFailedSkillWriteLeft, TestInstallRefusesASkillThatFailsCheck, TestInstallRefusesASkillFolderThatIsNotASkill, TestInstallRefusesASkillHomesFolderWouldLeaveBroken)
- agent create: asks only to replace, keeps every scope valid, checked composed beneath nearer layers; a yes approves the shown plan only. (TestAgentCreateAsksBeforeReplacing, TestAgentCreateKeepsEveryScopeValid, TestAHomeWriteIsCheckedComposedBeneathTheNearerLayers, TestConfirmedWritesRefuseChangesMadeWhileAsking)

## 7. Core

`core/workflow`: fan-out then join with the collection; a timed-out node; a verdict is output. (TestExampleWorkflowEndToEnd, TestExampleWorkflowJoinsWithoutATimedOutNode, TestVerdictIsOutputNotStatus)

`core/admit`:
- A worktree not exactly the revision's is refused for a `workspace.clean` process. (TestAnInPlaceCallRefusesAWorktreeItCannotAdmit)
- A candidate other than HEAD is refused. (TestIntentReviewIsRefusedOffItsCandidate)
- A fresh-only process is not continued; a Codex run without skills is not continued by a call that names skills. (TestAProcessThatSetsSessionSaysWhetherItsRunsAreContinued, TestACodexRunWithoutSkillsIsNotContinuedByACallThatNamesSome)
- A writer is admitted where a killed writer left its run. (TestAWriterCallIsAdmittedWhereAKilledWriterLeftItsRun)

`core/session`:
- Continuation costs from the session's latest recorded totals. (TestContinuationsCountFromTheSessionsLatestRecordedTurn)
- A stale turn is recovered in its session. (TestAStaleTurnIsRecoveredAndRunsShowPrintsTheRecovery, TestTheCompositionRecoversAStaleTurn)
- A runtime's failure reason reaches the record, with a bounded stderr tail. (TestARuntimesFailureReasonReachesTheRecord)

`core/attempts` and `core/verify` (22 tests in `verify_loop_test.go`, plus TestVerifyDeclarationEndToEnd): first pass makes no repair; repair in the same session and worktree; attempts run out; no progress stops; same failure twice stops; a run that changes what it checks fails; ignored files are not content; verify timeout; the call's timeout bounds the loop; cancellation ends the command; a failed repair turn ends the node; unknown or spent cost blocks repair; never after a failed turn; no session, no repair; capture reproduces the passing content; ignored state is checked; evidence for every attempt; a silent run killed as stale, and repaired.

`core/inputs`: a step brief's goal looked up relative to the caller; a file input cached by digest; `--goal` and `--answers` read from earlier runs; a brief of neither form refused. (TestAStepBriefsGoalIsLookedUpThroughTheComposition, TestAFileInputsWorkingCopyIsKeptInTheHomesCache, TestGoalAndAnswersAreRecordedAndShown, TestTheImplementWorkflowsCallImplementWithTheBriefsForm)

`core/watch` and `core/trail`: no archive integration test of their own; staleness shows up in the recovery and verify tests, the trail in TestOpenCodeCallRunsAsTheGeneratedAgent.

**changed** Continuation conditions move out of core (rule 5): TestContinuationEndToEnd and TestContinuationsCountFromTheSessionsLatestRecordedTurn split between the composition and `core/session`.

## 8. Wrappers

`runtime/<name>`:
- OpenCode runs as its generated agent; tool calls in events; continuation. (TestOpenCodeCallRunsAsTheGeneratedAgent)
- Pi sessions under the home; Pi installs no package; Claude Code gets the recorded skills; every adapter gets a call's skills. (TestPiSessionsAreKeptUnderTheHome, TestPiInstallsNoPackageTheProjectLists, TestACallsSkillsAreFoundInTheSettingsAndGivenToClaudeCode, TestACallNamingASkillRunsOnPiOpenCodeAndCodex)
- `CODEX_HOME` from the environment; runtimes and commands start through the injected starter. (TestTheProcessTellsTheUsersCodexHomeFromItsEnvironment, TestTheCompositionStartsItsRuntimesThroughItsStarter, TestTheCompositionStartsItsCommandsThroughItsStarter)

`git`: nested worktrees vs submodules; changes captured as a patch; ignored files. (TestHolderDistinguishesNestedWorktreesFromSubmodules, TestWorkspaceChangesAreKept, TestVerifyRunThatWritesOnlyIgnoredFilesPasses, TestVerifyCaptureReproducesThePassingContent, TestVerifyChecksTheWorktreeIgnoredStateIncluded)

`runstore`:
- runs list, show and export read today's records as committed (format contract, rule 6). (TestRunsListNamesTheRecordsOfToday, TestRunsShowPrintsTheRecordsOfTodayAsTheyAre, TestRunsExportReadsTheRecordsOfToday)
- export: byte-for-byte copy without the owner lock; a workflow's nodes; refused before writing; an identical copy kept; a differing copy refused; refused into the store; artifact digest fails; a partial copy not taken. (8 tests in `runs_export_test.go`)
- Reaping a killed run, its verify command, a killed workflow's nodes; the background reaper; a failed reap logged. (TestNextCallReapsWhatAKilledRunLeftBehind, TestNextCallReapsAKilledRunsVerifyCommand, TestNextCallReapsAKilledWorkflowsNodes, TestBuiltClientSharesTheBackgroundReaper, TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted, TestBuiltReaperLogsAFailedReap) — where reaping lives is open in the architecture doc.

## 9. Pages (format contracts, rule 6)

- Pages read a run's owner from `owner.lock`; read the settings layers; read today's records. (TestPagesReadTheRunsOwnersFromTheRunStore, TestPagesReadTheSettingsWithTheBinarysStore, TestPagesReadTheRecordsOfToday)

## 10. Not the binary's tests: the repository's settings, skill and docs

These test the shipped content (home's settings folder, `.agister`, prompts, schemas, the caller skill, the docs), with Agister as the tool. They belong with that content, not with the new code: about 75 tests.

- Home folder: installs and passes check, ignores live state, no fixed paths, no shared documents, five agents, one implement process, no policies, limits per role, guidance. (`home_folder_test.go`; `repo_settings_test.go` 53 tests)
- Schemas and prompts carry their contracts (advice, implementation, review result, judgement; coverage, case for value, goal, intent, architecture, tests, advisor, clarity). (`repo_settings_test.go`)
- Every process and workflow of home runs on the fake runtimes. (TestRepositoryProcessesRunOnFakeRuntimes)
- Briefs' forms; settings carry no comments. (`briefs_test.go`, TestTheSettingsCarryNoComments)
- The caller skill and docs guards. (`caller_skill_test.go`, `docs_test.go`)

## 11. Dropped

- Migration and compatibility: retiring the implement processes (`retire_test.go`, 5); a pre-ADR-030 backup with policies (TestRestoreUndoesAnInstallThatWrotePolicies); a pre-ADR-025 binary's hold (TestAnOlderBinarysHoldExcludesTheCompositionsWriter); old checkouts (TestBuiltReaperLeavesACheckoutARunningRunUses, TestBuiltWorkspaceAdaptersShareTheWorktreeCoordinator, TestTheProcessWorktreeCoordinatorLocksUnderTheHome); a pre-LAB-181 `provider.jsonl` (TestRunsExportCopiesAnOlderRunsProviderLog).
- Tests of the archive's wiring: TestBuiltClientReadsOnlyTheSourcesGiven (the `Gated` snapshot), TestTheInProcessCompositionWaitsOnAClockThatNeverMoves.
- Test harness: TestMain, `tempdir_test.go` (3), TestCleanupRunCancelsAndDrainsABlockedCall, TestEndRecordedEndsEveryRecordedEffect, and the helpers' own tests (TestCarries, TestDefinitionOfDoneNumbers, TestRefusedCombinators, TestNotSettings, TestFixedFilePaths, TestSharedDocuments).
