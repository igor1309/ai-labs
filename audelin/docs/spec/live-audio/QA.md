# Live audio — QA

Not an adapter, so every row drives it through a fake of its capture
interface: it gives numbered tones and fails, stops, fails to stop or
refuses to start on cue. The listener and the reader are the row's own,
each able to hold. A row reads back the tones each one received, their
times, and when, never just that a call was made. The real call of the
user spec (LAB-408) proves the whole path.

## S-1 Audio is heard while its reading is held

The reader holds before taking the first tone; the listener hears the
first and second tones while the reader is still held.
Evidence: `LiveAudioTests.liveAudioPassesAHeldReader`.

## S-2 Audio keeps its place in time

Tones of different lengths are given; each heard tone's time equals the
length of the tones given before it.
Evidence: `LiveAudioTests.liveTimesEqualTheAudioReadBeforeEachTone`.

## S-3 Audio is read while its hearing is held

The listener holds on the first tone; the reader takes the second and
third tones while the listener is still held.
Evidence: `LiveAudioTests.readingPassesAHeldListener`.

## S-4 Stopping ends live audio

After the capture is stopped, the listener has heard every given tone and
its listening has ended; the reader's stream ends after the last tone.
Evidence: `LiveAudioTests.stopDeliversAllAudioThenEndsListeningAndReading`.

## S-10 A failed stop ends live audio

The capture fake's stop fails and leaves its source open; the listener
hears every given tone and its listening ends; the stop throws the
fake's failure, and the reader's stream ends after the last tone.
Evidence: `LiveAudioTests.failedStopDrainsPiecesThatHaveNotYetBeenRead`.

## S-5 A failed capture is heard to its end

The capture fake fails after two tones; the listener hears both, then its
listening ends, and the reader takes both tones, then the fake's failure.
Evidence: `LiveAudioTests.failedCaptureDeliversEveryToneThenItsFailure`.

## S-6 A capture that does not start ends live audio

A listening begun before the start ends when the capture fake refuses to
start, and the start throws the fake's refusal.
Evidence: `LiveAudioTests.refusedStartEndsWaitingListening`.

## S-7 A listener from before the start hears the first audio

A listening begun before the start hears the first tone the capture
gives.
Evidence: `LiveAudioTests.listeningBeforeStartHearsTheFirstTone`.

## S-8 A second listener hears nothing

A second listening started while the first is hearing ends with no tone;
the first hears every later tone.
Evidence: `LiveAudioTests.secondListeningEndsWithoutTakingAudioFromTheFirst`.

## S-9 How far it captured is known before it is heard

The listener holds before taking a tone; how far it has captured already
includes that tone's end.
Evidence: `LiveAudioTests.capturedThroughIncludesAudioBeforeItIsHeard`.

## Piece statistics

Give a fake capture zero-only pieces, one nonzero sample among zeros,
NaN-only pieces, infinities, a finite nonzero mixed with nonfinite values,
and an empty piece. Assert the finite-nonzero flag for every piece and its
start and end on the captured timeline.

## RMS windows

Feed the same samples as one piece and as uneven pieces, including pieces
shorter than a window, at several capture rates. Compare every complete
window's times and RMS. Check known RMS values from signed samples and
zeros, and boundaries falling halfway through a sample's duration. A NaN
or infinity makes its window's RMS nonfinite, while the following finite
window has its expected RMS. Try lengths just before, at and after window
boundaries to prove a trailing partial window is omitted. Change rate with
a partial window pending and assert the new window begins at the new
piece's start and contains only the new rate's samples.

## Independent statistics subscriber

Subscribe before start in both orders relative to the listener. Receive
the first measurement while both audio consumers are unread. A second
statistics caller ends empty, as does a second listener, while the first
subscribers and reader retain every piece and matching intervals. Leave
statistics entirely unread while taking each piece from the listener and
reader before stopping; the buffered measurements remain available after
both audio views end.

## Statistics completion

Finish or fail the fake input after several pieces and assert that
statistics finish after the same intervals the listener received. Stop
with pieces pending and check that statistics drain before ending. For a
failed stop, hold input processing until stop has been called, then release
it and assert every piece is measured before statistics end, whether the
fake closes its source or leaves it open. A refused start and a stop before
start both finish a waiting statistics subscriber without values.
