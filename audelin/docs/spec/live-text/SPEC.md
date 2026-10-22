# Live text

Observer: the client that reads Live text's segments for one track of a
call.

Live text turns what a recogniser hears on one track into segments: each
holds settled words, which never change, and pending words, which may. It
knows nothing of the model behind the recogniser, of speakers or of storage.

## Decided

- One Live text per track. Whose track it is, and putting two tracks in
  time order, is the client's: two tracks already give the speakers, and
  Live text never needs to know them.
- The recogniser reports the words heard so far, each with the time it was
  heard in the track, and which of them are final when it knows. Turning a
  model's output into that is the model adapter's job. Windowed Parakeet
  gives word times and is final behind its windows. Streaming Nemotron gives
  only growing text until it finishes, so its adapter stamps a word with the
  audio fed when it appeared, about 0.4 s late, and marks nothing final.
- A segment closed by a pause settles, final or not: otherwise text from a
  recogniser with no final mark would stay pending all call.
- A pause is 2 s from the end of one word to the start of the next. In the
  owner's reading, Parakeet's word times showed gaps of 0 s at most
  sentence ends and up to 1.28 s inside a sentence, and Nemotron's text
  arrives in steps of about 1.1 s; 2 s is above both.
- Stopping asks the recogniser to finish and settles what it returns: its
  finish includes words it never confirmed, and the text so far is kept.
- A failed recogniser cannot finish, so its pending words settle as they
  were. Restarting it is the client's call.

```gherkin
Feature: Live text for one track

  Background:
    Given Live text is listening to a track

  Scenario: S-1 Words appear while they are spoken
    Given no word has been heard
    When the recogniser hears words
    Then I can read them as pending in a segment, with the time it started

  Scenario: S-2 Pending words change in place
    Given a segment has pending words
    When the recogniser hears those words differently
    Then I read the new words in their place, and the settled words before them stay

  Scenario: S-10 Pending words no longer heard are gone
    Given a segment has pending words
    When the recogniser reports no words where they were
    Then I can no longer read them

  Scenario: S-3 Words settle
    Given a segment has pending words
    When the recogniser makes them final
    Then I can read them as settled in the same segment

  Scenario: S-4 Settled words never change
    Given a segment has settled words
    When the recogniser later reports other words for the same time
    Then I still read the words as they settled

  Scenario: S-5 A pause starts a new segment
    Given a segment has pending words
    When the next words come after a pause
    Then I read them in a new segment, with the time it started, and the segment before it settled

  Scenario: S-6 Speech without a pause stays one segment
    Given a segment has words
    When the next words come without a pause
    Then I read them in the same segment

  Scenario: S-7 Stopping keeps the text so far
    Given a segment has pending words
    When I stop Live text
    Then I read every word the recogniser finished with as settled, and I can tell the track has ended

  Scenario: S-8 A failed recogniser keeps the text so far
    Given a segment has pending words
    When the recogniser fails
    Then I read every word heard as settled, and I can tell live text failed

  Scenario: S-9 The end of the audio keeps the text so far
    Given a segment has pending words
    When the audio ends
    Then I read every word the recogniser finished with as settled, and I can tell the track has ended
```

Not Live text's: recording the audio, storing segments, choosing the model,
the spelling of English terms, and filling in minutes recorded while live
text was off, which is the client running Live text over the recorded audio.
