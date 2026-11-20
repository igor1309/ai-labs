# Recordings — running a transcript again — QA

An async machine: each row is reducer cases with the effect each event
asks for, paired with effect tests for the same state and event. Message
formatters are spies: not called on init or when nothing is refused, called
once per refusal with the exact payload, their stub text the reason in the
state. Ports are spies whose completions are delivered as result events; a
fresh listing is a distinct fake listing whose contents and selection are
asserted. A row without evidence is Missing.

## S-1 Waits are kept as reported

Preparing, hearing 0.4, hearing 0.7, finishing: each wait and fraction kept; no effect.
Evidence: `RecordingsTranscriptAgainTests.S1_waitsAreKeptAsReported`.

## S-2 A made transcript lists again

Finishing, made: no run; the list effect; a distinct listing arrives and the call is selected in it.
Evidence: `RecordingsTranscriptAgainTests.S2_madeListsAgainAndSelectsTheCall`.

## S-3 A failed run is named

Hearing, failed: no run, the call selected, the reason kept, retry available; no list effect.
Evidence: `RecordingsTranscriptAgainTests.S3_failureKeepsItsReasonAndRetryOffer`.

## S-4 Cancelling stops the run

Hearing, cancel: one stop effect; stopped: no run, no failure; no list effect.
Evidence: `RecordingsTranscriptAgainTests.S4_cancelStopsOnceAndStoppedHasNoFailure`.

## S-5 A cancel too late still makes

Finishing, cancel, then made: no failure; the list effect and the call selected in the fresh listing.
Evidence: `RecordingsTranscriptAgainTests.S5_cancelTooLateStillMakes`.

## S-6 A recording stops the run

Hearing, recording started twice: one stop effect; stopped: the recording reason kept. Then made instead of stopped: no recording reason.
Evidence: `RecordingsTranscriptAgainTests.S6_recordingStopsOnceAndKeepsTheReasonUnlessMade`.

## S-7 Retrying asks again

Failed and still offered, retry: preparing; the run port asked for that call. Not offered: refused with the reason.
Evidence: `RecordingsTranscriptAgainTests.S7_retryChecksTheFailedCallAgain`.

## S-8 Shutdown stops a run

Hearing, shutdown: stop asked; settled published only after stopped arrives.
Evidence: `RecordingsTranscriptAgainTests.S8_shutdownSettlesOnlyAfterThePortAnswers`.

## S-9 Not idle alone stops nothing

Hearing, not idle: no effect; the run's state unchanged.
Evidence: `RecordingsTranscriptAgainTests.S9_notIdleAloneStopsNothing`.

## S-10 A made transcript is announced

Finishing, made: the transcript-changed output names the call, once.
Evidence: `RecordingsTranscriptAgainTests.S10_madeAnnouncesTheChangedCallOnce`.
