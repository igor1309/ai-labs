# System audio capture — QA

Most rows run through a fake of the Core Audio binding. The fake records
what the capture asks of it (the tap's processes or its "all but" list, a
mono mix, playback unmuted, a device start) and plays a distinct tone per
process only by what was asked, so a wrong request fails the row. It
accepts or refuses each request, changes its rate on a device change, and
stops its device on cue. The binding runs for real over a muted `afplay`
tone, so the test makes no sound. The real Zoom call of the user spec
(LAB-408) proves the whole path and that the call stays audible.

## S-1 A named process is heard

Fake: the tap is asked for the named process, mixed to mono with playback
unmuted, and its tone is read back. Real: the muted `afplay` tone is read
back above the noise floor. Evidence: Missing.

## S-2 Newly named processes are heard in the same capture

Fake: a second process is named mid-capture; its tone follows in the same
audio with no new start. Evidence: Missing.

## S-5 A new output device keeps the sound heard

Fake: the device changes and the format reads 24 kHz instead of 48; the
pieces after it carry 24 kHz. Evidence: Missing.

## S-6 A capture that cannot start fails

Fake: each starting step in turn refuses; the capture fails, and what it
made is released. Evidence: Missing.

## S-7 A capture the system stops fails

Fake: the device stops after some buffers; the capture reports the
failure. Evidence: Missing.

## S-8 A failed capture keeps what it heard

Fake: every buffer before the stop is read before the audio ends. Evidence:
Missing.

## S-9 Stopping ends the capture

Fake: stopping ends the audio and releases the tap and device. Real: a
muted `afplay` capture stopped. Evidence: Missing.

## S-10 A capture can follow a stopped one

Fake and real: after the first is stopped, a second capture's tone is read
back. Evidence: Missing.

## S-11 A capture that heard nothing ends cleanly

Fake: a tap that never delivers is stopped; the audio ends with no pieces
and no failure. Evidence: Missing.

## S-12 A process I did not name is left out

Fake: the tap is asked for the named process only; another process's tone
is absent. Evidence: Missing.

## S-13 A process I left out is not heard

Fake: the tap is asked for "all but" the left-out process; its tone is
absent. Evidence: Missing.

## S-14 A process that starts later is heard

Fake: under "all but", a process added after the start plays; its tone is
read back. Evidence: Missing.

## S-15 A naming the system refuses keeps the old one

Fake: a new naming is refused; the first process's tone keeps coming and
the capture does not fail. Evidence: Missing.

## S-17 Sound is read without muting it

Fake: the tap is asked to leave playback unmuted. The real Zoom call of the
user spec hears the far side while recording. Evidence: Missing.
