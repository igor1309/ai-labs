# Session — QA

Driven through a Session on the real machine loop with its real reducer and
handler, and a fake for each piece the handler is given. Each fake can be
held, can fail on cue, and adds an entry to an output the test reads when
it comes up, takes audio or text, and goes down. The call text fake turns
speech into text only while started and enabled, and reports its live-text
status on cue. Captures deliver audio only while started; track files and
the transcript accept output only while open. Captures send numbered audio
and call text sends numbered text on cue, so a row can tell what was kept. Rows read back the Session's state and those outputs, never that a
function was called.

## S-1 Both sides are recorded

Every piece let up, each capture sending its first audio the moment it
comes up and call text its first text: the state shows both tracks
recording; the output shows each destination up before its source, and
the track files and transcript hold that first audio and text. Evidence:
`bothSidesComeUpInDestinationOrder`, `processSelectionReachesOnlyCallCapture`.
Only the call capture receives the opaque process choice; microphone capture
starts without one.

## S-2 Ending keeps everything recorded

Recording, audio and text sent, ended, with call text sending more text as
it finishes: the state reads ended only after the last piece is down; each
track file holds all audio sent, the transcript all text including the
finishing text; the captures went down first. Held starts and stops keep the
tracks open and the Session ending until their results arrive, even if health
changes while waiting. Evidence: `endingKeepsAllOutputAndStopsSourcesFirst`,
`shutdownWaitsForStartsAndStopsBeforeClosingTracks`,
`healthChangesDuringStopDoNotErasePendingWork`.

## S-3 Ending during bring-up brings down only what came up

For each bring-up step in turn, bring-up held at that step, ended, the step
let up: the state reads ended only once the output shows every piece that
came up down, and no later piece ever up. Evidence: `endingDuringBringUpDoesNotStartLaterPieces`.

## S-4 A piece that comes up after the end is brought down

The call's capture held coming up, ended, then the capture let up: the
state is not ended until the output shows that capture down. Evidence:
`aCaptureThatComesUpAfterEndIsStoppedBeforeEnded`,
`healthChangesDuringStartDoNotErasePendingWork`.
Access loss or failure during any start preserves the pending start and the
cleanup owed for its eventual success.

## S-5 A failure that leaves no track is told

The call's folder failing at bring-up; both captures failing at bring-up;
both track files, then both captures, failing while recording: the state
says it cannot record and names the failure, nothing is brought down until
ended, what was kept stays, and no later piece comes up. Evidence:
`folderFailureSaysCannotRecordAndWaitsForEnd`, `bothTrackFailuresSayCannotRecord`,
`bothCaptureFailuresSayCannotRecord`,
`runtimeTrackFailureAndAccessLossSaysCannotRecord`,
`bothRuntimeCaptureFailuresSayCannotRecord`, `bothRuntimeTrackFailuresSayCannotRecord`,
`runtimeFailureMatrixRunsThroughSession`.

## S-6 Any other failure keeps the rest

For each other piece (the call app's processes, each capture, each track
file, call text, the transcript, and each side's access lost with no
capture failure), failing once at bring-up and once while recording with
audio and text already kept: the state names it and shows
the rest recording; what it kept stays in the output, and audio and text
sent after reach every other piece. Evidence:
`eachOtherBringUpFailureKeepsAnotherTrack`, `lostAccessIsNamedWhileTheOtherSideRecords`,
`runtimeFailureKeepsOtherSideAndNamesThePiece`,
`bringUpAccessLossKeepsTheOtherSide`, `runtimeFailureMatrixRunsThroughSession`,
`healthChangesDuringStartDoNotErasePendingWork`,
`healthChangesDuringStopDoNotErasePendingWork`.
The runtime matrix reads retained and later audio from each surviving track
and retained and later text from the surviving transcript. Access loss leaves
a started capture owing its stop before the track closes.

## S-7 Live text gets ready while the call records

Call text's fake reports getting ready, every piece up: the state shows
both tracks recording and live text getting ready. Only call text's reports
move it to on or back to getting ready; starting and switch acknowledgements
do not infer readiness. Evidence: `liveTextIsGettingReadyWhenRecordingStarts`,
`switchAcknowledgementDoesNotReportReadiness`.

## S-8 Live text switched off

Recording with live text on, text sent, switched off, then more speech:
the state shows live text off and both tracks recording; the transcript
holds the text before the switch and nothing after; the track files hold
all audio. A newer request replaces a held switch without concurrent switch
calls; an old result cannot overwrite it, and end awaits the switch in flight.
Evidence: `liveTextSwitchesOffAndStopsNewText`,
`newerLiveTextRequestReplacesHeldSwitch`, `endingWaitsForLiveTextSwitch`.

## S-9 Live text switched on

Recording with live text off, switched on, then speech: the state shows
live text on and the transcript holds the new text. Evidence: `liveTextSwitchesOnAndAcceptsNewText`.

## S-10 The preference switched off applies to the running Session

Recording with live text on, Settings' preference turned off, then
speech: the state shows live text off; the transcript holds no new text.
Evidence: `preferenceEventsChangeTheRunningSession`.

## S-11 The preference switched on applies to the running Session

Recording with live text off, Settings' preference turned on, then speech:
the state shows live text on; the transcript holds the new text. Evidence:
`preferenceEventsChangeTheRunningSession`.

## S-12 The preference starts the Session

Settings' preference off, a Session begins, then speech: the state shows
live text off; the transcript holds no text; the track files hold the
audio. Evidence: `preferenceAtStartControlsLiveText`.

## S-13 A piece failing to close is named

For each track file and the transcript, recording with audio and text
kept, ended, that piece failing on cue as it closes: every other piece
still goes down; the state reads ended and names the failure; the output
keeps what was sent before. Evidence: `closeFailureIsNamedAndEndingContinues`.

## S-14 A failed choice of processes still hears the call

The processes fake fails its choice; every other piece comes up. The call
capture fake sends numbered audio only when started for every app but
Audelin's. The state names the processes failure and shows both tracks
recording, and the call track holds that numbered audio. Evidence: `failedProcessChoiceHearsEveryAppButAudelin`.

## S-15 The transcript is saved every 5 seconds

Through the session rig with a clock whose every sleep ends at once and is
kept: once text is written, every wait the writer asks for is 5 seconds.
Evidence: `SessionTranscriptTests.theAppWaitsFiveSecondsAfterEachTranscriptWrite`.

## S-16 A crash keeps every final entry already saved

`SessionCrashWriter` runs a call through the app's composition that keeps
saving every 10 ms and reports each save once it returns. It is killed with
SIGKILL once a save holds 2, 4 or 8 final entries, wherever the writer then
is; the file starts with the header and every entry final in that last
reported save. A planted rewrite that cut the file to nothing failed all
three cases (2026-10-31). Evidence: `SessionCrashTests.sigkillDuringACallKeepsEveryFinalEntryAlreadySaved(finalEntries:)`.

## Silent call warning

Pure reducer tests supply interval statistics and microphone windows using a
shared time origin, without clocks or sleeps. Every asserted state transition
has a separate effect assertion; statistics always yield no effect.

`prolongedCallZerosWithRecentMicActivityWarnOnce`,
`nonzeroCallSampleResetsSilenceInterval` and
`laterCallAudioClearsWarningWithoutRearmingNotification` establish the warning,
the silence interval's reset and clearing without another warning in the same
recording. `nonzeroCallAudioClearsWarningEvenWhileMicrophoneLags` proves that
clearing does not wait for microphone coverage.

`staleMicActivityDoesNotWarn`,
`callSilenceThresholdIncludesExactly300Seconds`,
`microphoneRecencyIncludesExactly120Seconds`,
`microphoneActivityNeeds100Milliseconds` and
`microphoneActivityIncludesRMSOfPoint01` cover the 300-second, 120-second,
99-versus-100 ms and RMS 0.01 boundaries. These are uncalibrated Amanu values:
300 seconds excludes natural pauses, 120 seconds of recent microphone activity
suggests the user is talking, and RMS 0.01 sustained for 100 ms excludes clicks
and room noise.

`captureStartOffsetsDoNotCauseWarning`,
`delayedCallStatisticsDoNotCauseFalseWarning` and
`delayedMicrophoneCoverageDoesNotWarnEarly` cover different start offsets,
delays on either stream, future activity and retaining earlier activity while
the microphone is ahead. `gapInMicrophoneWindowsBreaksSustainedActivity`,
`quietMicrophoneWindowBreaksSustainedActivity` and
`gapsInCallStatisticsDoNotCountAsExactZeros` cover interrupted observations.
`audioEventsOutsideRecordingAreIgnored`, `beginStartsWithCleanAudioObservation`
and `warningLeavesHealthFailuresAndRecordabilityAlone` establish phase gating,
reset and independence from recording failures.

`invalidAndOverlappingIntervalsAreIgnored` proves that malformed or overlapping
observations cannot advance coverage or clear an existing warning.
`nonfiniteMicrophoneRMSDoesNotQualify` excludes invalid levels from activity.
