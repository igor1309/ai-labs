# Call names — QA

Driven through the reducer with spies for the injected matcher and
after-call rule, and through the effect handler with fake call-app sources
that report evidence and acknowledge a stop on cue. Rows read back each
call's names and what each fake source was asked to do.

## S-1 A row takes the name seen when it was said
Evidence: `rowsPassExactEvidenceToNamingAndUseItsAnswer`,
`firstRecordingOnStartsTheClock`,
`startDeliversReportsInCallTimeFromBothSources`,
`firstSightAddsRosterNamesInOrderAndOpensIntervals`,
`rosterAndSpeakingUpdateBrowserEvidenceAndPublishedValues`,
`onlyOpenBrowserConnectionsRaiseThroughUsingTheRowInstant`,
`recordingOffClearsTheClockAndKeepsEvidenceAndNames`.
The observers cover `beforeRecordingStartsAPollReportsNothing`,
`eachPollReportsItsChangesThenATickInCallTime`,
`aMessageBeforeRecordingStartsIsHeldAndPlacedOnceItStarts` and
`aClockedConnectionReportsItselfAndItsMessagesInCallTime`. The composer
checks the wiring in `aConnectedExtensionNamesTheRemoteRow`.

## S-2 Confirmed names replace live ones
Evidence: `ConfirmationTests`.

## S-3 A finished call is confirmed while the next records
Two calls held, the same row id in each, turns for the first: only its
names change. Also through the composer's `AfterCallNamesWiringTests`.
Evidence: Missing.

## S-4 Ending one call leaves the other watched
Two watches, the first stopped, evidence then reported for the second: a
new row of the second is named. Evidence: Missing.

## S-5 A finished call is let go
Finalization ended for a call, then its turns: no names change.
Evidence: Missing.
