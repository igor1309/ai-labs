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

Missing.

## S-4 A blocked relaunch does nothing

Missing.

## S-5 A granted claim starts the relaunch

Missing.

## S-6 A refused claim keeps Audelin running

Missing.

## S-7 A blocker during the take releases a late grant

Missing.

## S-8 A quit during the take releases a late grant

Missing.

## S-9 A failed start releases the claim

Missing.

## S-10 A scheduled relaunch quits holding the claim

Missing.

## S-11 Termination waits for an unanswered take

Missing.

## S-12 A quit while scheduling keeps quitting after a failure

Missing.

## S-13 Termination waits for an unanswered relaunch start

Missing.
