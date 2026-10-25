# Side text — QA

Driven through fakes of its own interfaces: a live audio stream that
gives numbered word-tones on cue, holds a delivery on cue and ends on cue;
a fill in that brings back given words, can be held and can fail; and a
live text that turns each tone into a known word, gives one word only
when finishing, can be held stopping, and can fail hearing or finishing. Words given
after a switch off are checked not to come back, before and after a
held fill in is let go. A word comes back only if its tone was given.
"Its live text has stopped" means the fake's stop was called and has
returned before side text read as ended; with that stop held, side text
has not ended. Every ending row checks it.

## S-1 Audio is read as it comes

Words given one at a time: each word comes back before the next is given. Evidence: Missing.

## S-2 Live audio is read after filling in

Words 1 to 5 are captured while fill in is held reading up to word 3,
and the live audio delivers words 2 to 5, word 3 straddling where fill in
stops; on release words 1 to 5 come back once each, in order. Evidence: Missing.

## S-3 Switched off, the text stays as it is

One word comes back, fill in is held, live text is switched off, two live
words are given and the fill in is let go with its words: the text is the
one word, before and after the release. Evidence: Missing.

## S-4 Switched on, it fills in again

Two words come back, live text is switched off, three more are given,
then it is switched on with fill in bringing all five: each comes back
once, the last three marked written later. Evidence: Missing.

## S-5 Its text ends with its audio

Words given, then the audio ends: every word and the finish-only word come
back settled, and side text reads as ended. Evidence: Missing.

## S-6 Audio ending while filling in finishes after it

The audio ends while fill in is held; on release its words and the
finish-only word come back settled, then side text reads as ended. Evidence: Missing.

## S-7 Audio ending while off keeps the text so far

Two words come back, live text is switched off, more are given, the audio
ends: side text reads as ended with the two words only. Evidence: Missing.

## S-8 Stopping reads the audio to its end

Words given while a delivery is held, stop asked, the audio ends; on
release every word and the finish-only word come back settled before side
text reads as ended. Evidence: Missing.

## S-9 Stopping while filling in abandons it

Stop asked while fill in is held after one word: side text reads as ended
with that word, fill in abandoned and still held. Evidence: Missing.

## S-10 Abandoning ends it at once

Words come back, the audio stays open, abandon asked: side text reads as
ended with those words while the audio is still open. Evidence: Missing.

## S-11 Abandoning while filling in ends it at once

Abandon asked while fill in is held after one word and the audio is open:
side text reads as ended with that word, fill in still held and the audio
still open. Evidence: Missing.

## S-12 Live text failing while hearing ends it

The fake fails hearing the second word: side text reads as failed with the
first word kept. Evidence: Missing.

## S-15 Live text failing while finishing ends it

Words come back, the audio ends, the fake fails finishing: side text reads
as failed with those words kept. Evidence: Missing.

## S-13 Filling in failing ends it

Fill in fails after bringing one word: side text reads as failed with that
word kept. Evidence: Missing.

## S-14 Stopping twice ends once

Words given with a delivery held, two stops asked, the audio ends: on
release both stops return together, every word and the finish-only word
come back settled, side text reads as ended once, and the fake's stop was
called once. Evidence: Missing.
