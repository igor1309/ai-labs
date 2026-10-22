# System audio capture — QA

Most rows run through a fake of the Core Audio binding. The fake lists
processes, accepts or refuses a tap, delivers mono buffers with timestamps
at a rate it can change, and stops its device on cue. The binding runs for
real over a tone played by `afplay` into a tap of that process alone, muted
when tapped, so the test makes no sound. The whole capture is proven on a
real Zoom call by the user spec (LAB-408), which is also where the call
staying audible is checked.

## S-1 The chosen processes' sound is heard

Fake: the call app's buffers come out in order, and the tap is asked for
call app processes' choice with a mono mixdown. Real: the muted `afplay`
tone is read back above the noise floor. Evidence: Missing.

## S-2 A helper the call app opens later is heard

Fake: a helper with its own tone appears in the process list; on the next
choice its tone comes out of the same audio, with no new start. A refused
update keeps the first process's tone coming. Evidence: Missing.

## S-3 Sound keeps its time after a quiet start

Fake: the first buffer arrives 3 s of tap time after the start, and the
track opens with 3 s of silence. Evidence: Missing.

## S-4 Sound keeps its time after a quiet stretch

Fake: the buffers' timestamps jump by 2 s, and 2 s of silence fill the gap.
Evidence: Missing.

## S-5 A new output device keeps the call heard

Fake: the output device changes and its format reads 24 kHz instead of
48; the tone after the change comes out at 24 kHz, and the time before it
is unchanged. Evidence: Missing.

## S-6 A capture that cannot start fails

Fake: each starting step in turn (tap, format, device, callback, device
start) refuses; the capture fails, and nothing it made is left behind.
Evidence: Missing.

## S-7 A capture the system stops fails

Fake: the device stops after some buffers; the capture reports the failure.
Evidence: Missing.

## S-8 A failed capture keeps what it heard

Fake: the buffers before the device stopped are all read before the audio
ends. Evidence: Missing.

## S-9 Stopping ends the track

Fake: stopping ends the audio and releases the tap and device. Real: a
muted `afplay` capture stopped. Evidence: Missing.

## S-10 A capture can follow a stopped one

Fake: after the first is stopped, a second capture's tone is read back.
Real: two muted `afplay` captures in a row, each tone read back. Evidence:
Missing.

## S-11 A capture that heard nothing ends cleanly

Fake: a tap that never delivers a buffer is stopped; the audio ends with
no samples and no failure. Evidence: Missing.
