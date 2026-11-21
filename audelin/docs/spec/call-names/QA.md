# Call names — QA

Driven through the reducer with spies for the injected matcher and
after-call rule, and through the effect handler with fake call-app sources
that report evidence and acknowledge a stop on cue. Rows read back each
call's names and what each fake source was asked to do.

## S-1 A row takes the name seen when it was said
Evidence: `rowsPassExactEvidenceToNamingAndUseItsAnswer`,
`firstRecordingOnStartsTheClock`,
`startDeliversMonotonicReportsFromBothSources`,
`firstSightAddsRosterNamesInOrderAndSpeakerChangesCloseThePreviousInterval`,
`rosterAndSpeakingUpdateBrowserEvidenceAndPublishedValues`,
`onlyOpenBrowserConnectionsRaiseThroughUsingTheRowInstant`,
`recordingOffClosesTheWindowAndKeepsEvidenceAndNames`.
The observers cover `eachPollReportsItsReadingAndTickAtTheSameMonotonicInstant`
and `aClockedConnectionReportsItselfAndItsMessagesAtMonotonicInstants`. The
composer checks the wiring in `aConnectedExtensionNamesTheRemoteRow`,
`sessionNamesTheRowAndReleasesItsPort`, and
`readingUsesTheRecordingInstantEvenWhenItsDeliveryWaits`.

## S-2 Confirmed names replace live ones
Evidence: `ConfirmationTests` and
`afterCallTurnsUseEvidenceOnlyAfterTheSourceCloses`.

## S-3 A finished call is confirmed while the next records
Evidence: `finishedCallIsConfirmedWhileTheNextRecordsWithTheSameRowID`,
`confirmationReachesOnlyTheFinishedCallsNamesPort`, and
`recordingConfirmsTheFinishedCallsNamesWhileTheNextCallRecords`.

## S-4 A new recording starts while the previous watch stops
Evidence: `endingOneWatchLeavesTheOtherCallNamingItsRows`,
`theAcknowledgedStopStartsOnlyTheNextWatch`,
`anEndedPendingWatchIsSkippedWhenThePreviousWatchCloses`,
`stopClosesTheChannelAndEndsTheStream`, and
`theNextRecordingAndPanelStartWhileThePreviousWatchStops`.
`releasingNamesKeepsTheWatchStoppingUntilItsSourceCloses` checks that the
next watch still has to wait when the previous names port has finished.

## S-5 A finished call is let go
Evidence: `finalizedCallIsReleasedAndLateTurnsAreIgnored`,
`finalizationReleasesNamesBeforeTheWatchAcknowledgesItsStop`,
`sessionEndKeepsNamesOnlyIfATranscriptOpened`,
`releasingNamesKeepsTheWatchStoppingUntilItsSourceCloses`,
`readingUsesTheRecordingInstantEvenWhenItsDeliveryWaits`, and
`sessionNamesTheRowAndReleasesItsPort`.

## S-6 Zoom evidence begins once recording is on

Evidence: `zoomEvidenceBeginsWithTheFirstPollInTheRecordingWindow` and
`delayedZoomPollsAndTicksCountOnlyInsideTheRecordingWindow`. The observer
reports repeated readings, silence and loss of access to the meeting in
`eachPollReportsItsReadingAndTickAtTheSameMonotonicInstant`.

## S-7 A roster sent before recording counts once recording is on

Evidence: `earlyBrowserRosterAndSpeakingArePlacedInOrderWhenRecordingStarts`
and `browserMessagesArrivingAfterRecordingAreHeldAndNeverPlaced`.
The observer's calibration buffer is covered by
`messagesBeforeTheFirstClockReplyAreHeldAndPlacedInOrderOnceItComes` and
`anUncalibratedConnectionKeepsOnlyItsNewestMessagesInOrder`.

## S-8 A connection that leaves before recording leaves nothing

Evidence: `browserDisconnectBeforeRecordingDropsOnlyThatConnectionsMessages`.
