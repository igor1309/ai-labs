# Transcript writing — QA

Driven through fakes of its own interfaces: a call text whose start,
switch and stop are recorded and can be held, and which sends updates on
cue, also while starting and stopping; a transcript that records each
whole text written, can hold a write and fail a given one, or be absent;
and a failure report that records what it is told, in order with stop's
return. "Kept" means the transcript's last whole text written. Updates
passed on are read from the decorator's own updates.

## S-1 Call text's text is kept as it changes

Three updates sent one after another; each is written whole, in order,
and each is passed on before its write returns (writes held, then
released). Evidence: `TranscriptWritingTests.eachUpdateIsWrittenWholeInOrderAndPassedOnAtOnce`.

## S-2 Only the latest text is kept after a slow write

The first write held, two more updates sent, then released; the next and
last write is the third text, and the second is never written. Evidence:
`TranscriptWritingTests.updatesDuringAHeldWriteWriteOnlyTheLatest`.

## S-3 Text while starting is kept

Call text sends an update while its start is held; while still held,
that text is read from the decorator's updates and written. Evidence:
`TranscriptWritingTests.textSentWhileStartingIsKept`.

## S-4 Switching off reaches call text

Started on, switched off; the switch reaches call text, the off update it
sends is read from the decorator's updates, and it is written. Evidence:
`TranscriptWritingTests.switchingOffReachesCallTextAndTextIsStillKept`.

## S-5 Switching on reaches call text

Started off, switched on; the switch reaches call text, the on update it
sends is read from the decorator's updates, and it is written. Evidence:
`TranscriptWritingTests.switchingOnReachesCallTextAndTextIsStillKept`.

## S-6 Stopping returns after the last text is kept

Table of two: call text's stop held after its last update is written, and
its stop returning while that last write is held. In each, stop has not
returned until the held one is released, then returns with the last text
kept. Evidence: `TranscriptWritingTests.stoppingWaitsForCallTextAndTheLastWrite`.

## S-7 A failed write is told as the transcript's

The second and third of four writes fail; the report is told two
transcript failures, call text's switch still reaches it, and the fourth
text is kept. Evidence: `TranscriptWritingTests.eachFailedWriteIsToldAndWritingGoesOn`.

## S-8 A write after a failed one keeps the newer text

A write fails; the next update's write returns, and that newer text is
kept. Evidence: `TranscriptWritingTests.aWriteAfterAFailedOneKeepsTheNewerText`.

## S-9 The last write failing still lets stopping return

The last update's write fails at stop; the report is told one transcript
failure before stop returns, and stop returns. Evidence:
`TranscriptWritingTests.theLastWriteFailingIsToldBeforeStoppingReturns`.

## S-10 Call text failing is passed on as call text's

A write held; call text sends a failed update and ends its updates. While
the write is still held, the failed update is read unchanged from the
decorator's updates; the held write then fails on release,
the report is told one transcript failure and nothing of call text, and
the failed update's text is written last. Evidence:
`TranscriptWritingTests.callTextFailingIsPassedOnWhileTheTranscriptFailsApart`.

## S-11 Call text runs without a transcript

The transcript absent; start, a switch and stop all reach call text and
return, updates are passed on, and the report is told nothing. Evidence:
`TranscriptWritingTests.withoutATranscriptCallTextRunsAndNothingIsTold`.

## S-12 Stopping twice

The last write held; a second stop is called; neither returns until the
write is released, then both do, and call text's stop was asked once
or joined. Evidence: `TranscriptWritingTests.aSecondStopWaitsForTheFirst`.

## S-13 Writes are spaced by a pause

Through a fake pause that lasts until ended: the first update is written
and a pause starts; two more updates are passed on but not written while
it lasts; once ended, only the third is written and the next pause
starts. Evidence: `TranscriptWritingTests.aPauseFollowsEachWriteAndOnlyTheLatestTextIsWrittenAfterIt`.

## S-14 Stopping ends the pause

In the pause after the first write, an update is sent and stop is asked
for; call text sends its last text while stopping. The pause is
cancelled, not ended, the last text is written, and stop returns.
Evidence: `TranscriptWritingTests.stoppingEndsThePauseSoTheLastTextIsWrittenBeforeStopReturns`.
