# Recording conditions: a moving calls folder — QA

An async machine: reducer rows build the given state with a factory, each
`_state` test paired with an `_effect` test for the same state and event.
Run: `cd audelin/macos && ../scripts/swift-test-bounded.sh 600 --filter RecordingConditionsTests`.

## S-1 A move makes the folder moving

Evidence: `aMoveMakesTheFolderMoving_state`, `_effect`; `aMoveBeforeAnyReadingMakesTheFolderMoving_state`, `_effect`; `readingDuringAMoveKeepsTheFolderMoving_state`, `_effect`.

## S-2 A lost folder that starts moving is published again

Evidence: `aLostFolderThatStartsMovingIsPublishedAgain_state`, `_effect`.

## S-3 The end of a move waits for a fresh reading

Evidence: `theEndOfAMoveAsksForAReading_state`, `_effect`; handler: `aReadingAfterAMoveDeliversTheReadingForThatMove`.

## S-4 A fresh reading ends the move

Evidence: `theAwaitedReadingEndsTheMove_state`, `_effect`.

## S-5 A fresh reading can find the folder lost

Evidence: `theAwaitedReadingCanFindTheFolderLost_state`, `_effect`.

## S-6 Another reading does not end the move

Evidence: `anotherReadingDoesNotEndTheMove_state`, `_effect`.

## S-7 An earlier move's reading does not end a later move

Evidence: `aNewMoveSupersedesTheAwaitedReading_state`, `_effect`; `anEarlierMovesReadingDoesNotEndALaterMove_state`, `_effect`.

## S-8 Only the latest move's reading ends moving

Evidence: `onlyTheLatestMovesReadingEndsMoving_state`, `_effect`.
