# Recorded capture — QA

Not an adapter, so every row drives it through fakes of its own
interfaces: a capture fake that gives numbered tones and fails, stops or
refuses to start on cue, and a track fake that holds or fails a write on
cue and records each write. A row reads back the tones the fake track
holds, and when, never just that a call was made. Hearing the side live
is live audio's QA. The real call of the user spec (LAB-408) proves the
whole path.

## S-1 Captured audio is kept

Three numbered tones are given; the track fake holds all three, in order.
Evidence: `RecordedCaptureTests.capturedTonesAreKeptInOrder`.

## S-14 A slow track does not hold the capture back

The track fake holds its first write; the capture fake's second and third
tones are taken from it while that write is still held.
Evidence: `RecordedCaptureTests.slowTrackDoesNotHoldCaptureReading`.

## S-4 Stopping keeps the last audio

The track fake holds the last write; the stop is still waiting until the
write is let go, and then the track holds every tone.
Evidence: `RecordedCaptureTests.stopWaitsForTheHeldLastWrite`.

## S-6 A failed write ends the side

The second write fails; the failure is told as the track's before any
stop, the capture fake is stopped, and the track holds the first tone.
Evidence: `RecordedCaptureTests.failedSecondWriteReportsTrackAndStopsCapture`.

## S-7 A failed capture keeps what it gave

The capture fake fails after two tones; the failure is told as the
capture's before any stop, and the track holds both tones.
Evidence: `RecordedCaptureTests.failedCaptureReportsBeforeStopAndKeepsEveryGivenTone`.

## S-11 A capture failure is told while its track is slow

The track fake holds its first write and the capture fails; the failure
is told while the write is still held.
Evidence: `RecordedCaptureTests.captureFailureIsReportedWhileTheFirstWriteIsHeld`.

## S-8 A failed stop keeps what was given

The capture fake's stop fails after two tones; the stop is told as
failed, and when it returns the track holds both tones.
Evidence: `RecordedCaptureTests.failedStopWaitsForEveryGivenTone`.

## S-13 A failed write's own stop is told when it fails

A write fails and the stop it makes fails, with the source either ending
or staying open. The track and capture failures arrive before any stop I
ask for; that stop then tells no more failures and stops the capture only
once.
Evidence: `RecordedCaptureTests.failedWriteReportsItsFailedStopAsCaptureBeforeAnyRequestedStop`.

## S-10 A capture that does not start fails

The capture fake refuses to start; the start is told as failed, and the
track fake holds no write.
Evidence: `RecordedCaptureTests.refusedStartWritesNothing`.
