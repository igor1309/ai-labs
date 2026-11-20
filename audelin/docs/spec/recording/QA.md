# Recording — QA

Driven through Recording on the real machine loop with its real reducer
and handler. Its handler's dependency is a fake Session starter: each
Session it begins is held until told to come up, fail or end, and the fake
adds an entry per begin and per end to an output the test reads. Events
come in as the merge mapping delivers them. Rows read back the state and
that output, never that a function was called.

## S-1 A call begins a recording

Automatic on, nothing missing, a call starts, the Session comes up: the
state is a recording begun by the call; the output shows one begin.
Evidence: `callBeginsAutomaticRecording()`.

## S-2 A call begins nothing when automatic recording is off

Automatic off, a call starts: the state is idle; the output is empty.
Evidence: `automaticOffDoesNotBeginRecording()`.

## S-3 The user begins a recording

No call, the user starts, the Session comes up: the state is a recording
begun by hand.
Evidence: `userBeginsRecordingWithoutCall()`.

## S-4 The user ends a recording

From S-3, the user stops: the output shows an end and the state is still
ending; the Session ends: the state is idle.
Evidence: `userEndsRecordingAfterSessionEnds()`.

## S-5 A call's end ends its recording, however it began

From S-1, and again from a call with automatic off where the user started,
the call ends: an end in the output; the Session ends: idle.
Evidence: `callEndEndsRecordingHoweverItBegan(_:)`.

## S-6 A call the user stopped is not recorded again

From S-1, the user stops, the Session ends, the call's apps report again:
idle, one begin in the output; the call ends and a new one starts: a
second begin.
Evidence: `stoppedCallWaitsForANewCall()`.

## S-7 A start while a recording is on changes nothing

For a call start and the user's start, each while the Session is held
beginning and again once it runs: the state is the same recording; one
begin in the output.
Evidence: `repeatedStartsKeepTheSameRecording(_:_:)`.

## S-8 A call during bring-down is recorded after it

From S-4's end held, a call starts with automatic on: the state is ending;
the Session ends: a recording begun by the call runs, two begins in the
output.
Evidence: `callDuringEndingBeginsAfterSessionEnds()`.

## S-9 A missing condition holds a start back

For each condition, missing, and for a call start and the user's start in
turn: idle, that condition named; the output is empty.
Evidence: `missingConditionHoldsStartBack(_:_:)`.

## S-10 A Session that cannot record is ended and named

While beginning and again while running, the Session says it cannot record
with a reason: an end in the output; it ends: idle, the reason named; it
stays named through a condition change and the user's live text switch,
and clears when the next recording begins.
Evidence: `cannotRecordEndsSessionAndKeepsReasonUntilNextBegin(_:)`.

When a stop ends the Session before its failure report arrives, the state
stays idle with no Session and names the reason without another end. The
reason survives condition and automatic changes until the next begin;
reports from older or unknown Sessions are ignored.
Evidence: `failureAfterSessionEndsStaysNamedUntilNextBegin(_:)`,
`idleRetainsOnlyTheLatestSessionsFailure(_:)`,
`lateBeginAndFailureReportsCannotChangeTheNextSession()`.

## S-11 A stop while a recording begins ends it

For the user's stop and the call's end in turn, a Session held while
beginning: an end in the output and the state is ending; the Session ends:
idle.
Evidence: `stopDuringBeginningEndsSession(_:)`.

## S-12 A call that ends during bring-down is not recorded

From S-4's end held, a call starts with automatic on and ends; the Session
ends: idle, one begin in the output.
Evidence: `callEndingDuringBringDownDoesNotBeginRecording()`.

## S-13 Losing the calls folder ends a recording

For the folder going missing and running out of room in turn, from S-1:
an end in the output; the Session ends: idle, that named; for a lost
access instead, nothing ends.
Evidence: `folderOrRoomLossEndsRecordingButAccessLossDoesNot(_:)`.

## S-14 A condition coming back allows a start

For each condition, missing then back, then the user starts, the Session
ends, and a call starts with automatic on: a recording runs each time.
The later Session's stop names its own end in the output; it stays ending
until that Session completes, then becomes idle.
Evidence: `restoredConditionAllowsManualAndAutomaticStarts(_:)`.

For every pair of missing conditions, recovering one leaves the other
named and blocks both manual and automatic starts. Recovering the last
condition allows either start.
Evidence: `partialRecoveryKeepsOtherConditionsBlockingStarts(_:)`.

## S-15 A side failing while recording is named

From S-1, for each fault in turn and then two together: the Session's
report keeps the phase recording and names each fault reported, once.
Evidence: `RecordingTests.sessionFaultsStayNamedUntilTheNextRecording(_:)`.

Compose maps the Session's failures to faults: microphone access or
capture to no microphone, call access or capture to no call audio, a
track on either side to disk full; a transcript or call text failure to
none.
Evidence: `RecordingPiecesWiringTests.cannotRecordAndFaultsReachRecording()`, `RecordingReducerTests.faultsFollowTheCurrentSession(_:)`.

## S-16 Faults are named until the next recording

From S-15's fault, the Session ends: idle, the fault still named; a new
start begins with no fault.
Evidence: `RecordingTests.sessionFaultsStayNamedUntilTheNextRecording(_:)`.

## S-17 A fault from an earlier Session changes nothing

A fault reported with an id other than the running Session's leaves the
state as it was.
Evidence: `RecordingReducerTests.faultsFollowTheCurrentSession(_:)`.

## S-18 to S-22 Transcript output and shutdown

Pieces over a temporary calls folder and a fake transcript writer report every
successful save and failure in order, snapshot names after the file closes,
report nothing when opening fails, and share one output across successive calls.
Evidence: `RecordingTranscriptOutputTests.transcriptReportsEverySaveOutcomeInOrder()`,
`RecordingTranscriptOutputTests.closedCarriesNamesAtFileClose()`,
`RecordingTranscriptOutputTests.unopenedTranscriptReportsNothing()`,
`RecordingTranscriptOutputTests.successiveRecordingsShareOneOrderedOutput()`.

The composed Recording ends its output after its last close on shutdown. The
subscription forwards every value, including repeated saves, then sends
finalization the end of its input. Quit during an opening waits for that call's
final publication before termination, and quit with saved text makes it final as
last saved without model work.
Evidence: `RecordingPiecesWiringTests.shutdownFinishesTranscriptOutputAfterLastClose()`,
`TranscriptFinalizationCompositionTests.subscriptionMapsEveryValueThenSendsInputEndedWhenTheOutputEnds()`,
`TranscriptFinalizationCompositionTests.quitDuringTranscriptOpenPublishesItsFinalBeforeTermination()`,
`TranscriptFinalizationCompositionTests.quitWithSavedTextPublishesLastSavedWithoutEnteringDiarizer()`.

## Calls-folder claim (S-23 to S-33)

Reducer rows build the given state with `makeState`, each `_state` test
paired with an `_effect` test for the same state and event; effect handler
rows drive a spy of the claim port and read the delivered event.

## S-23 A start claims the calls folder before call audio

Evidence: `aStartClaimsTheCallsFolder`; `RecordingClaimTests.aGrantGoesOnToCallAudio_state`, `_effect`; handler: `aClaimAnswersWithTheClaimsAnswerForItsSession`.

## S-24 A start refused by a relaunch begins nothing

Evidence: `aStartRefusedByARelaunchEnds_state`, `_effect`.

## S-25 A start refused by a move begins after it

Evidence: `aStartRefusedByAMoveWaits_state`, `_effect`; `theEndOfTheMoveBeginsAWaitingStart_state`, `_effect`; `aLostFolderAfterTheMoveDropsAWaitingStart_state`, `_effect`.

## S-26 A start refused by a move that has already ended claims again

Evidence: `aRefusalByAMoveThatHasEndedClaimsAgain_state`, `_effect`.

## S-27 A start while the folder moves begins after the move

Evidence: `aStartWhileTheFolderMovesWaits_state`, `_effect`; `aCallWhileTheFolderMovesWaits_state`, `_effect`; compose: `composedMoveHoldsAStartUntilReleaseAndRefreshesTheList`.

## S-28 A stop drops a start waiting for a move

Evidence: `aStopDropsAWaitingStart_state`, `_effect`.

## S-29 A call's end drops its start waiting for a move

Evidence: `aCallsEndDropsItsWaitingStart_state`, `_effect`.

## S-30 A start by hand outlasts a call's end while waiting

Evidence: `aWaitingStartByHandOutlastsTheCallsEnd_state`, `_effect`.

## S-31 Late news of a move does not end a recording

Evidence: `lateNewsOfAMoveDoesNotEndARecording_state`, `_effect`.

## S-32 The claim is released last

Evidence: `releasedCallAudioReleasesTheClaim_state`, `_effect`; `theReleasedClaimEndsTheSession_state`, `_effect`; handler: `releaseAnswersThatCallAudioIsReleased`, `aClaimReleaseReleasesItsTokenAndEndsTheSession`.

## S-33 A stop during the take releases a late grant

Evidence: `aStopDuringTheTakeWaitsForIt_state`, `_effect`; `aGrantAfterAStopIsReleased_state`, `_effect`; `aRefusalAfterAStopEndsTheStart_state`, `_effect`.

## S-34 Automatic recording turned off drops only a call's waiting start

Evidence: `automaticOffDropsOnlyACallsWaitingStart_state`, `_effect`.

## Waiting for call audio (S-35 to S-40)

Driven as the claim rows are, with a fake readiness port whose answers the
test sets and a fake clock the test advances; rows read the state, the
claims taken and released, and the readiness requests.

## S-35 A call's start refused for call audio tries again

A call starts, readiness answers false: idle, call audio missing, the claim
released. The clock advances five seconds: a claim and a readiness request;
it answers true and the Session comes up: a recording begun by the call.

## S-36 Call audio coming back begins a waiting call's start

From the wait, call audio is published available: a readiness request
without the clock advancing; it answers true: a recording begun by the call.

## S-37 A call's start goes on waiting while call audio is missing

From the wait, five seconds and a false answer: idle with call audio
missing; five more seconds: another request.

## S-38 The wait for call audio ends with the call, a stop or automatic off

From the wait, each of call end, user stop and automatic off, then the
clock advances: no further request, idle.

## S-39 Another missing condition or shutdown ends the wait

From the wait, each of calls folder lost, room lost and shutdown, then the
clock advances: no further request, idle.

## S-40 A start by hand refused for call audio does not wait

No call, the user starts, readiness answers false; the clock advances: no
further request, idle with call audio missing.
