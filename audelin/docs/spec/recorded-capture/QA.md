# Recorded capture — QA

Not an adapter, so every row drives it through fakes of its own
interfaces: a capture fake that gives numbered tones and fails, stops or
refuses to start on cue, and a track fake that holds or fails a write on
cue and records each write. A row reads back the tones the listener heard
and the fake track holds, and when, never just that a call was made. The
real call of the user spec (LAB-408) proves the whole path.

## S-1 Captured audio is heard live and kept

Three numbered tones are given; the listener hears all three in order and
the track fake holds all three. Evidence: Missing.

## S-2 Live audio does not wait for the track

The track fake holds its first write; the listener hears the second tone
while the first write is still held. Evidence: Missing.

## S-3 Audio keeps its place in time

Tones of different lengths are given; each heard tone's time equals the
length of the tones written before it. Evidence: Missing.

## S-4 Stopping keeps the last audio

The track fake holds the last write; the stop is still waiting until the
write is let go, and then the track holds every tone. Evidence: Missing.

## S-5 Stopping ends live audio

After a stop, the listener has heard every given tone and its listening
has ended. Evidence: Missing.

## S-6 A failed write ends the side

The second write fails; the failure is told as the track's before any
stop, the capture fake is stopped, the listening ends, and the track holds
the first tone. Evidence: Missing.

## S-7 A failed capture keeps what it gave

The capture fake fails after two tones; the failure is told as the
capture's before any stop, and the listener heard both tones and the
track holds both. Evidence: Missing.

## S-11 A capture failure is told while its track is slow

The track fake holds its first write and the capture fails; the failure
is told while the write is still held. Evidence: Missing.

## S-8 A failed stop keeps what was given

The capture fake's stop fails after two tones; the stop is told as
failed, and when it returns the track holds both tones. Evidence: Missing.

## S-9 A second listener hears nothing

A second listening started while the first is hearing ends with no tone;
the first goes on to hear every later tone. Evidence: Missing.

## S-12 A listener from before the start hears the first audio

Listening begins before the start; the listener hears the first tone the
capture gives. Evidence: Missing.

## S-10 A capture that does not start fails

The capture fake refuses to start; the start is told as failed, the track
fake holds no write, and a waiting listener's listening ends. Evidence:
Missing.
