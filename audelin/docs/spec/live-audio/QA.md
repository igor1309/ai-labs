# Live audio — QA

Not an adapter, so every row drives it through a fake of its capture
interface: it gives numbered tones and fails, stops, fails to stop or
refuses to start on cue. The listener and the reader are the row's own,
each able to hold. A row reads back the tones each one received, their
times, and when, never just that a call was made. The real call of the
user spec (LAB-408) proves the whole path.

## S-1 Audio is heard while its reading is held

The reader holds before taking the first tone; the listener hears the
first and second tones while the reader is still held. Evidence: Missing.

## S-2 Audio keeps its place in time

Tones of different lengths are given; each heard tone's time equals the
length of the tones given before it. Evidence: Missing.

## S-3 Audio is read while its hearing is held

The listener holds on the first tone; the reader takes the second and
third tones while the listener is still held. Evidence: Missing.

## S-4 Stopping ends live audio

After the capture is stopped, the listener has heard every given tone and
its listening has ended; the reader's stream ends after the last tone.
Evidence: Missing.

## S-10 A failed stop ends live audio

The capture fake's stop fails and leaves its source open; the listener
hears every given tone and its listening ends; the stop throws the
fake's failure, and the reader's stream ends after the last tone.
Evidence: Missing.

## S-5 A failed capture is heard to its end

The capture fake fails after two tones; the listener hears both, then its
listening ends, and the reader takes both tones, then the fake's failure. Evidence: Missing.

## S-6 A capture that does not start ends live audio

A listening begun before the start ends when the capture fake refuses to
start, and the start throws the fake's refusal. Evidence: Missing.

## S-7 A listener from before the start hears the first audio

A listening begun before the start hears the first tone the capture
gives. Evidence: Missing.

## S-8 A second listener hears nothing

A second listening started while the first is hearing ends with no tone;
the first hears every later tone. Evidence: Missing.

## S-9 How far it captured is known before it is heard

The listener holds before taking a tone; how far it has captured already
includes that tone's end. Evidence: Missing.
