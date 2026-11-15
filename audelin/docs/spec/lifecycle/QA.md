# Lifecycle — QA

An async machine: rows are reducer cases built with `makeTermination`, each
`_state` test paired with an `_effect` test for the same state and event;
effect handler rows drive spies of its ports and read the delivered event.
Run: `cd audelin/macos && ../scripts/swift-test-bounded.sh 600 --filter LifecycleTests`.

## S-1 Quit waits for every participant

Evidence: `quitPublishesTheIntention_state`, `_effect`.

## S-2 The last settled participant terminates

Evidence: `aSettledParticipantIsCrossedOff_state`, `_effect`; `quitWithNothingToSettleTerminates_state`, `_effect`.

## S-3 An unblocked relaunch takes the claim

Evidence: `anUnblockedRelaunchTakesTheClaim_state`, `_effect`; `blockersAreKept_state`, `_effect`; handler `claimDeliversTheAnswer`; compose `idleAppStartsTheRelaunchThenQuits`.

## S-4 A blocked relaunch does nothing

Evidence: `aBlockedRelaunchTakesNoClaim_state`, `_effect`; `aRelaunchWhileBusyOrNotRunningChangesNothing_state`, `_effect`; compose `openFolderPickerHoldsTheRelaunch`.

## S-5 A granted claim starts the relaunch

Evidence: `aGrantedClaimStartsTheRelaunch_state`, `_effect`; handler `relaunchDeliversWhetherTheNewInstanceWasScheduled`.

## S-6 A refused claim keeps Audelin running

Evidence: `aRefusedClaimKeepsRunning_state`, `_effect`; compose `recordingIsNotInterruptedAndTheRelaunchFollowsItsEnd` (Recording holds the claim).

## S-7 A blocker during the take releases a late grant

Evidence: `aBlockerDuringTheTakeCancelsIt_state`, `_effect`; `aCancelledGrantIsReleased_state`, `_effect`; `aCancelledRefusalKeepsRunning_state`, `_effect`; `theReleaseReturnsToRunning_state`, `_effect`; handler `releaseDeliversReleasedOnceTheClaimIsLetGo`.

## S-8 A quit during the take releases a late grant

Evidence: `aQuitDuringTheTakeCancelsIt_state`, `_effect`; `aGrantAfterTheQuitIsReleasedWithoutStarting_state`, `_effect`; `theReleaseAfterTheQuitTerminates_state`, `_effect`.

## S-9 A failed start releases the claim

Evidence: `aFailedStartReleasesTheClaim_state`, `_effect`; `theReleaseReturnsToRunning_state`, `_effect`; compose `failedRelaunchKeepsTheAppRunningAndFreesTheClaim`.

## S-10 A scheduled relaunch quits holding the claim

Evidence: `aScheduledRelaunchQuitsHoldingTheClaim_state`, `_effect`; `aScheduledRelaunchWithNothingToSettleTerminates_state`, `_effect`.

## S-11 Termination waits for an unanswered take

Evidence: `terminationWaitsForLifecyclesOwnWork_state`, `_effect` (taking); `aHeldTokenDoesNotHoldTermination_state`, `_effect`.

## S-12 A quit while scheduling keeps quitting after a failure

Evidence: `aQuitWhileSchedulingStaysAQuit_state`, `_effect`; `aFailedStartAfterTheQuitReleasesAndKeepsQuitting_state`, `_effect`; `aScheduledStartAfterTheQuitKeepsTheClaimAndTerminates_state`, `_effect`.

## S-13 Termination waits for an unanswered relaunch start

Evidence: `terminationWaitsForLifecyclesOwnWork_state`, `_effect` (starting, releasing).

Answers outside their stage change nothing: `anAnswerOutsideItsStageChangesNothing_state`, `_effect`.
