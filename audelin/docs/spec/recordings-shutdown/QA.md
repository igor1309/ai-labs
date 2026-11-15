# Recordings — quitting — QA

Reducer rows are built with the Recordings test factories, each `_state`
test paired with an `_effect` test. Run:
`cd audelin/macos && ../scripts/swift-test-bounded.sh 600 --filter RecordingsTests`.

## S-1 An idle Recordings settles at once

Evidence: `stoppingWithNoMoveSettlesAtOnce`.

## S-2 A quit during the take releases a late grant

Evidence: `aGrantAfterTheQuitMovesNoCallAndReleasesAtOnceBeforeSettling`,
`stoppingSettlesWhenTheMoveIsRefused`.

## S-3 A quit during a move waits for its release

Evidence: `stoppingDrainsAnAlreadyAcceptedMoveAndRejectsNewActions`,
`stoppingSettlesWhenTheMoveReleasesTheFolder`; rewritten for the claim token.

## S-4 A quit during a merge waits for the merge

Evidence: `storageSettlesForQuitOnlyOnceARunningMergeEnds`.
