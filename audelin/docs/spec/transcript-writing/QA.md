# Transcript writing — QA

Driven through fakes of its own interfaces: a call text whose start,
switch and stop are recorded and can be held, and which sends updates on
cue, also while starting and stopping; the port it hands texts to, whose
fake saves each text handed at once unless a save is held or set to
fail, and whose finishing saves the last text handed and can be held or
fail, or which is absent; and a failure report that records what it is
told, in order with stop's return. "Kept" means the last text the fake
saved, never just handed. Pacing itself is save pacing's QA. Updates
passed on are read from the decorator's own updates.

## S-1 Call text's text is kept as it changes

Three updates sent one after another; after each the fake has saved that
text. Stopped, the fake keeps the last. Evidence: `TranscriptWritingTests.eachUpdateIsWrittenWholeInOrderAndPassedOnAtOnce`.

## S-3 Text while starting is kept

Call text sends an update while its start is held; while still held,
that text is read from the decorator's updates and written. Start released and call text stopped; the fake keeps that text. Evidence:
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

Table of three: call text's stop held; finishing held; both held, each
released alone in either order. In each, stop has not returned until
every held one is released, then returns with the last text kept. In
each, call text sends a new final text while stopping, and that text is
the one kept. The both-held case is Missing. Evidence: `TranscriptWritingTests.stoppingWaitsForCallTextAndTheLastWrite`.

## S-9 The last write failing still lets stopping return

The last update's write fails at stop; the report is told one transcript
failure before stop returns, and stop returns. Evidence:
`TranscriptWritingTests.theLastWriteFailingIsToldBeforeStoppingReturns`.

## S-10 Call text failing is passed on as call text's

A save held and set to fail; call text sends a failed update and ends its
updates. While the save is held, the failed update is read unchanged from
the decorator's updates; released, the save fails, the report is told one
transcript failure and nothing of call text, and finishing saves the
failed update's text, which the fake keeps. Evidence:
`TranscriptWritingTests.callTextFailingIsPassedOnWhileTheTranscriptFailsApart`.

## S-11 Call text runs without a transcript

The transcript absent; start, a switch and stop all reach call text and
return, updates are passed on, and the report is told nothing. Evidence:
`TranscriptWritingTests.withoutATranscriptCallTextRunsAndNothingIsTold`.

## S-12 Stopping twice

Finishing held; a second stop is called; neither returns until it is
released, then both do with the last text kept, and call text's stop was asked once
or joined. Evidence: `TranscriptWritingTests.aSecondStopWaitsForTheFirst`.

## S-15 A failed write leaves call text going

The transcript fails a write; live text is switched off and call text
sends a new update; the update is read from the decorator and the next
write keeps it. Evidence: Missing.

## S-16 Every update reaches a slow reader

Three updates sent before the decorator's updates are read; all three are
read, in order. Evidence: `TranscriptWritingTests.unreadUpdatesRetainEverySnapshot`.

## S-17 Updates reach me while a save is slow

A save held and two more updates sent; both are read from the decorator's
updates before the save is released. Evidence: Missing.
