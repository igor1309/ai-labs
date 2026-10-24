# Session — QA

Driven through a Session on the real machine loop with its real reducer and
handler, and a fake for each piece the handler is given. Each fake can be
held, can fail on cue, and adds an entry to an output the test reads when
it comes up, takes audio or text, and goes down. The call text fake turns
speech into text only while its live text is on, as call text does. Captures send numbered
audio and call text sends numbered text on cue, so a row can tell what was
kept. Rows read back the Session's state and those outputs, never that a
function was called.

## S-1 Both sides are recorded

Every piece let up, each capture sending its first audio the moment it
comes up and call text its first text: the state shows both tracks
recording; the output shows each destination up before its source, and
the track files and transcript hold that first audio and text. Evidence:
`bothSidesComeUpInDestinationOrder`.

## S-2 Ending keeps everything recorded

Recording, audio and text sent, ended, with call text sending more text as
it finishes: the state reads ended only after the last piece is down; each
track file holds all audio sent, the transcript all text including the
finishing text; the captures went down first. Evidence: `endingKeepsAllOutputAndStopsSourcesFirst`.

## S-3 Ending during bring-up brings down only what came up

For each bring-up step in turn, bring-up held at that step, ended, the step
let up: the state reads ended only once the output shows every piece that
came up down, and no later piece ever up. Evidence: `endingDuringBringUpDoesNotStartLaterPieces`.

## S-4 A piece that comes up after the end is brought down

The call's capture held coming up, ended, then the capture let up: the
state is not ended until the output shows that capture down. Evidence:
`aCaptureThatComesUpAfterEndIsStoppedBeforeEnded`.

## S-5 A failure that leaves no track is told

The call's folder failing at bring-up; both captures failing at bring-up;
both track files, then both captures, failing while recording: the state
says it cannot record and names the failure, nothing is brought down until
ended, what was kept stays, and no later piece comes up. Evidence: `folderFailureSaysCannotRecordAndWaitsForEnd`, `bothTrackFailuresSayCannotRecord`, `bothCaptureFailuresSayCannotRecord`.

## S-6 Any other failure keeps the rest

For each other piece (the call app's processes, each capture, each track
file, call text, the transcript, and each side's access lost with no
capture failure), failing once at bring-up and once while recording with
audio and text already kept: the state names it and shows
the rest recording; what it kept stays in the output, and audio and text
sent after reach every other piece. Evidence: `eachOtherBringUpFailureKeepsAnotherTrack`, `lostAccessIsNamedWhileTheOtherSideRecords`.

## S-7 Live text gets ready while the call records

Call text's fake reports getting ready, every piece up: the state shows
both tracks recording and live text getting ready. Evidence: `liveTextIsGettingReadyWhenRecordingStarts`.

## S-8 Live text switched off

Recording with live text on, text sent, switched off, then more speech:
the state shows live text off and both tracks recording; the transcript
holds the text before the switch and nothing after; the track files hold
all audio. Evidence: `liveTextSwitchesOffAndStopsNewText`.

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
