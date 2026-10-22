# System audio capture — QA

Most rows run through a fake of the Core Audio binding: it accepts or
refuses a tap and a new naming, delivers mono buffers with timestamps from
the processes it was given, changes its rate on a device change, and stops
its device on cue. The binding runs for real over a tone played by
`afplay`, tapped alone and muted while tapped, so the test makes no sound.
The whole path is proven on a real Zoom call by the user spec (LAB-408),
which also checks the call stays audible.

## S-1 A named process is heard

Fake: a named process's tone is read back. Real: the muted `afplay` tone is
read back above the noise floor. Evidence: Missing.

## S-2 A process I did not name is left out

Fake: a process outside the naming plays its own tone; the track has the
named tone only. Evidence: Missing.

## S-3 A process I left out is not heard

Fake: "all but" a process; that process's tone is absent. Evidence:
Missing.

## S-4 A process that starts later is heard

Fake: under "all but", a process added after the start plays; its tone is
read back. Evidence: Missing.

## S-5 Newly named processes are heard in the same track

Fake: a second process is named mid-track; its tone follows in the same
audio with no new start. A refused naming keeps the first tone coming.
Evidence: Missing.

## S-6 Sound keeps its time after a quiet start

Fake: the first buffer arrives 3 s of tap time after the start; the track
opens with 3 s of silence. Evidence: Missing.

## S-7 Sound keeps its time after a quiet stretch

Fake: the timestamps jump by 2 s; 2 s of silence fill the gap. Evidence:
Missing.

## S-8 A new output device keeps the sound heard

Fake: the device changes and the format reads 24 kHz instead of 48; the
tone after it comes out at 24 kHz, and the time before it is unchanged.
Evidence: Missing.

## S-9 A capture that cannot start fails

Fake: each starting step in turn refuses; the capture fails, and what it
made is released. Evidence: Missing.

## S-10 A capture the system stops fails

Fake: the device stops after some buffers; the capture reports the
failure. Evidence: Missing.

## S-11 A failed capture keeps what it heard

Fake: every buffer before the stop is read before the audio ends. Evidence:
Missing.

## S-12 Stopping ends the track

Fake: stopping ends the audio and releases the tap and device; a capture
that heard nothing ends the same way. Real: a muted `afplay` capture
stopped. Evidence: Missing.

## S-13 A capture can follow a stopped one

Fake and real: after the first is stopped, a second capture's tone is read
back. Evidence: Missing.
