# Core Audio processes — QA

The translation runs through a fake of the binding: hand-made process
objects with bundle ids, names and flags, whose list and `IsRunning`
notifications fire on cue, and a fake clock. The list runs for real
against this Mac with a muted `afplay`. No row uses the microphone.

## S-1 A process with audio open is listed

Real: a muted `afplay` is in the list with its name. Evidence: Missing.

## S-2 A process with no bundle id is listed by name

Real: `afplay`, which has no bundle id, is listed as `afplay`. Evidence:
Missing.

## S-3 Audelin is marked as itself

Fake: the object whose pid is the test's own is marked. Evidence: Missing.

## S-4 A call app on the microphone starts a call

Fake: for `us.zoom.xos`, `ru.yandex.desktop.telemost` and each browser
family's prefix with a helper's bundle id under it, in turn, the
recording flag turns on and `IsRunning` fires; a call in that app is told.
Evidence: Missing.

## S-5 Another app on the microphone is not a call

Fake: `com.apple.VoiceMemos` records for 60 s of fake clock; no event is
told. Evidence: Missing.

## S-6 A call ends 30 s after the microphone

Fake: Zoom stops at 0 s; at 29 s nothing is told, at 30 s the end is.
Evidence: Missing.

## S-7 A short silence does not end the call

Fake: Zoom stops, and starts again 10 s later; by 60 s no end and no
second start is told. Evidence: Missing.

## S-8 A second call app joins the call

Fake: Chrome starts beside Zoom; Zoom stops at 0 s, Chrome at 20 s; no
second start is told, nothing at 49 s, the end at 50 s. Evidence: Missing.

## S-9 An app is on the microphone while any of its processes is

Fake: two Chrome pids record; one stops at 0 s; by 60 s no end is told.
Evidence: Missing.

## S-10 A list the system refuses fails

Fake: the binding refuses the list; the ask fails. Evidence: Missing.
