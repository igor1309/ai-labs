# Core Audio processes — QA

The translation runs through a fake of the binding: hand-made process
objects with bundle ids, names and flags, whose list and `IsRunning`
and device-list notifications fire on cue, and a fake clock. The list runs
for real against this Mac with a muted `afplay`. No row uses the microphone.

## S-1 A process with audio open is listed

Real: a muted `afplay` is in the list with its name. Evidence:
`CoreAudioBindingTests.realAfplayWithAudioOpenIsListed`.

## S-2 A process with no bundle id is listed by name

Real: `afplay`, which has no bundle id, is listed as `afplay`. Evidence:
`CoreAudioBindingTests.realAfplayWithoutBundleIDIsNamedByExecutable`.

## S-3 Audelin is marked as itself

Fake: the object whose pid is the test's own is marked. Evidence:
`CoreAudioProcessesTests.audelinIsMarkedAsItself`.

## S-4 Zoom on the microphone starts a call

Fake: `us.zoom.xos`'s recording flag turns on and `IsRunning` fires; a
call in Zoom is told. Evidence:
`CoreAudioProcessesTests.zoomOnTheMicrophoneStartsACall`.

## S-5 Another app on the microphone is not a call

Fake: `com.apple.VoiceMemos` records for 60 s of fake clock; no event is
told. Evidence:
`CoreAudioProcessesTests.anotherAppOnTheMicrophoneIsNotACall`.

## S-6 A call ends 30 s after the microphone

Fake: Zoom stops at 0 s; at 29 s nothing is told, at 30 s the end is.
Evidence: `CoreAudioProcessesTests.aCallEndsThirtySecondsAfterTheMicrophone`.

## S-7 A short silence does not end the call

Fake: Zoom stops, and starts again 10 s later; by 60 s no end and no
second start is told. Evidence:
`CoreAudioProcessesTests.aShortSilenceDoesNotEndTheCall`.

## S-8 A second call app joins the call

Fake: Chrome starts beside Zoom, and Zoom stops; at 60 s the call is on
in Zoom, and no second start or end was told. Evidence:
`CoreAudioProcessesTests.aSecondCallAppJoinsTheCall`.

## S-9 An app is on the microphone while any of its processes is

Fake: two Chrome pids record; one stops at 0 s; by 60 s no end is told.
Evidence: `CoreAudioProcessesTests.anAppIsOnTheMicrophoneWhileAnyOfItsProcessesIs`.

## S-10 A list the system refuses fails

Fake: the binding refuses the list; the ask fails. Evidence:
`CoreAudioProcessesTests.aListTheSystemRefusesFails`.

## S-11 Telemost on the microphone starts a call

Fake: `ru.yandex.desktop.telemost`'s recording flag turns on and the device
list fires; a call in Telemost is told. Evidence:
`CoreAudioProcessesTests.telemostOnTheMicrophoneStartsACall`.

## S-12 A browser on the microphone starts a call

Fake: each browser family's helper (`com.google.Chrome.helper`,
`com.apple.WebKit.GPU`, …) in turn starts alone in a fresh run; a call in
that browser is told for every one. Evidence:
`CoreAudioProcessesTests.aBrowserOnTheMicrophoneStartsACall`.

## S-13 A call ends 30 s after the last call app leaves

Fake: Zoom stops at 0 s, Chrome at 20 s; at 49 s the call is on, and at
50 s its end is told. Evidence:
`CoreAudioProcessesTests.aCallEndsThirtySecondsAfterTheLastCallAppLeaves`.
