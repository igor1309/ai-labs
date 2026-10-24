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
