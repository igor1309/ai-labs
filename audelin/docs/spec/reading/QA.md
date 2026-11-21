# Reading — QA

Driven through the reducer alone: a state built with a `make*` factory, one
event, and the resulting state compared with the given state plus the
expected change. Formatters are spies; rows read back the rows, holds,
banners, names and recording time the state shows.

## S-1 A failed side shows a banner and a gap
Evidence: `repeatedFaultKeepsItsFirstTimeAndDoesNotLayOutAgain`,
`recordingOffClearsFaultsAndUsesTheRebuiltRows`,
`faultsAndWarningAreNewestFirstAndOnlyFaultsPersist`.
The composer checks that the panel shows the gap at its original call time
in `aLostCaptureReachesThePanelOnItsRecordingClock`.

## S-2 Silence clears without leaving a gap
Evidence: `clearingWarningKeepsFaultsWithoutLayingOutAgain`, `layoutGetsOnlyProblemsThatLeaveAGap`.

## S-3 Held selections stay as selected
Evidence: `holdsSurviveLayoutChangesAndRecordingTransitions`,
`holdsPreserveExactTextAndIgnoreDuplicates`, `lettingGoRemovesOnlyTheMatchingHold`.

## S-4 Scrolling away counts new entries
Evidence: `layoutReceivesExactPayloadAndItsResultBecomesState`,
`scrollingAndJumpingControlFollowingAndNewCount`.

## S-5 Live text prepares while recording
Evidence: `logSelectionKeepsAvailableRowsAndHolds`, `textStatusChoosesTheLog`.

## S-6 Finishing keeps what was read
Evidence: `logSelectionKeepsAvailableRowsAndHolds`, `textStatusChoosesTheLog`.

## S-7 A finished call takes its confirmed names
A call ended, then its confirmed names: the rows read those names. The
composer's `AfterCallNamesWiringTests` covers the wiring. Evidence:
`confirmedNamesReachEveryRemoteEntryIncludingAfterRecordingEnds`.

## S-8 The next call starts clean
Evidence: `openingTheNextCallClearsTheFinishedCall`,
`earlierCallsCannotChangeTheDisplayedCall`, and
`recordingConfirmsTheFinishedCallsNamesWhileTheNextCallRecords`.

## S-9 Text before capture waits
Text, then capture beginning: the log is empty, then shows that text.
Text and names before capture are kept with no banner. Fault reports while
recording is off leave the log empty. Recording off before or after capture
preserves whether capture began.
Evidence: `textBeforeCaptureIsKeptWhileTheLogStaysEmpty`,
`reportsWhileRecordingIsOffLeaveTheLogEmpty`,
`namesBeforeCaptureAreKeptWhileTheLogStaysEmpty`,
`recordingOffBeforeCaptureKeepsTheLogEmpty`,
`firstCaptureShowsTheKeptTextAndBanners`,
`recordingOffAfterCaptureBeganKeepsTheLogOpen`,
`captureBeginningAgainKeepsTheBanners`.

## S-10 Confirmed names reach final entries
A final remote entry and a later one, then a confirmed set: both read their
names; a tentative set names only the entries of the latest text update,
including entries sealed by that update. Evidence:
`tentativeNamesReplaceOnlyTheLatestTextUpdate`,
`confirmedNamesReachEveryRemoteEntryIncludingAfterRecordingEnds`,
`confirmedEmptyReplacesAllLiveNames`,
`namesBeforeTextAreStoredWithoutLayout`, `namesArrivingBeforeTextNameLaterEntries`,
`laterTextKeepsSpeakerPlacesAndUsesTheReplacementNameSet`,
`namesReachEntriesInsideWrittenLaterGroups`,
`confirmationWithTheSameNamesRemovesTentativeMarks`, `identicalNamesChangeNothing`.
The composer checks the layout and panel cache wiring in
`renamedFinalRowsReachTheCachedPanelMapping`.

## S-11 Time runs from the first recording instant
Recording on at an instant, ticks at later and earlier instants: the time
reads from the first instant. Earlier ticks and ticks in the same displayed
second leave the state unchanged. Evidence:
`firstRecordingOnStartsTheClockEvenWhenItArrivesAfterATick`,
`laterRecordingOnKeepsTheFirstInstant`, `tickUsesElapsedTimeFromTheFirstRecordingInstant`,
`earlierTicksAndTicksInTheSameDisplayedSecondDoNothing`,
`recordingOffClearsFaultsAndUsesTheRebuiltRows`.

## S-12 Speaker places follow the final text

Evidence: `speakerPlacesWaitForTheLastText`,
`theSessionsSpeakersReachTheRowsOfItsLastText`, and
`anEndedRecordingStillShowsItsLastTextAndSpeakers`.
