# Microphone capture — QA

Fake rows drive an engine seam: it delivers multi-channel buffers, posts
configuration and default-input changes, refuses starts and restarts, and
reports its time from a test clock; tests never sleep. Real rows run
locally only against the Mac's default input (hosted CI has none), and
the live text preview shows the whole path.

## S-1 The user is heard

Fake: buffers of two channels, the voice on the second only, are read
as their mono mix at the device's rate, in order, each before the next is
delivered and before any stop. Real: the engine starts on the default input with voice
processing off and audio is read. Evidence:
`allChannelsAreMixedAndReadLiveAtTheDeviceRate`,
`theMeanIncludesEveryChannel`,
`theDefaultInputDeliversLiveAudioWithoutVoiceProcessing`.

## S-2 A new input device keeps the user heard

Fake: a system default-input change that holds for 1.5 s rebuilds on the new
device, and its buffers are read at its rate. Evidence:
`aHeldDefaultInputRebuildsOnlyAfterSettling`,
`aDifferentCandidateMustSettleForItsOwnFullInterval`.

## S-3 A device change keeps the track in time

Fake: a configuration change with 2 s before the new engine's first
buffer reads 2 s of zeros at the new rate before it, so the first new
sample sits at the elapsed time; a gap of exactly 10 min is padded whole.
Evidence: `aConfigurationGapIsPaddedWholeAtTheNewRate`.

## S-11 A gap too long to keep in time fails

Fake: a gap of 10 min and one buffer's length ends the audio with a
failure after every sample before the gap, and reads no padding.
Evidence: `aGapOverTenMinutesFailsWithoutPaddingAfterEarlierAudio`.

## S-4 A capture that cannot start fails

Fake: a refused start fails the start and leaves no tap installed.
Evidence: `aRefusedStartCleansEveryInstalledResource`.

## S-5 A capture that cannot follow a change fails

Fake: a refused rebuild after a change ends the audio with a failure.
Evidence: `aRefusedRebuildFailsAfterEveryEarlierPiece`.

## S-6 A failed capture keeps what it heard

Fake: every buffer before the refused rebuild is read before the failure.
Evidence: `aRefusedRebuildFailsAfterEveryEarlierPiece`.

## S-7 Stopping ends the capture

Fake: a buffer delivered while stop runs is read before the audio
finishes; stop removes the tap, stops the engine and finishes the audio;
stopping twice is harmless. Evidence:
`stoppingReadsABufferDeliveredDuringStopAndIsIdempotent`.

## S-8 A capture can follow a stopped one

Fake and real: a second capture after a stopped one reads audio.
Evidence: `anotherCaptureCanFollowAStoppedOne`,
`aRealCaptureCanFollowAStoppedCapture`.

## S-9 A capture that heard nothing ends cleanly

Fake: a capture stopped before any buffer finishes with no pieces and no
failure. Evidence: `stoppingBeforeAnyBufferEndsCleanly`.

## S-10 A brief input change is not followed

Fake: a default-input change reverted within 1.5 s, while the original
input keeps delivering a known ramp, rebuilds nothing, and the ramp is
read back whole with no padding. Evidence:
`aRevertedDefaultInputKeepsTheWholeRampWithoutPadding`,
`aCancelledSettleCallbackCannotRebuildAfterReversionOrStop`.
