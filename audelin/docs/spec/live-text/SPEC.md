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
  heard in the track, and how far they are final. Turning a model's output
  into that is the model adapter's job. Windowed Parakeet gives word times
  and is final behind its windows. Streaming Nemotron times each token as
  it decodes it and is final behind its last word.
- Only the recogniser makes words final, and it makes each word final
  within a bounded stretch of audio after it. A pause starts a segment and
  settles nothing: a recogniser may show a quick reading as pending and
  replace it with a better one, and settling at a pause would keep the
  quick one (research run 7b: three of 76 words).
- Segments are cut afresh from the words at each change: a cut between
  settled words never changes, and a cut between pending words goes with
  them.
- A pause is 2 s from the end of one word to the start of the next. In the
  owner's reading, Parakeet's word times showed gaps of 0 s at most
  sentence ends and up to 1.28 s inside a sentence, and Nemotron's text
  arrives in steps of about 1.1 s; 2 s is above both.
- A segment is bounded so a long monologue reads as paragraphs and the
  client can put the other track's words between them in time order. Once
  a segment has run 15 s, it ends after the next word that ends a sentence
  (`.`, `?`, `!` or `…`); with no sentence end it ends before the first
  word that starts 30 s or more after it began. Live caption tools do the
  same: they commit at completed sentences or at a length limit, never an
  unbounded paragraph. These two cuts fall only between settled words, so
  a paragraph break never moves once shown.
- A pause after fewer than three words that end no sentence starts no
  segment: those words join the next one, so a recogniser's stray word
  never stands alone.
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
    Then I read them in a new segment, with the time it started

  Scenario: S-11 Words before a pause settle only when final
    Given a segment has pending words
    When the next words come after a pause
    Then I still read the words before the pause as pending
    And they settle when the recogniser makes them final

  Scenario: S-12 A pause no longer heard is gone
    Given pending words with a pause between them
    When the recogniser hears them again without the pause
    Then I read them in one segment

  Scenario: S-6 Speech without a pause stays one segment while it is short
    Given a segment has run less than 15 s
    When the next words come without a pause
    Then I read them in the same segment

  Scenario: S-13 A long segment ends at a sentence end
    Given a segment has run 15 s
    When a settled word ends a sentence and more words follow without a pause
    Then I read the words after it in a new segment, with the time it started

  Scenario: S-14 A segment with no sentence end ends at 30 s
    Given a segment's words end no sentence
    When a settled word starts 30 s or more after the segment began
    Then I read it and the words after it in a new segment

  Scenario: S-15 Length cuts wait for settled words
    Given a segment has run 15 s
    When a pending word ends a sentence
    Then I read the words after it in the same segment until it settles

  Scenario: S-16 A short fragment before a pause joins the next words
    Given a segment has fewer than three words and none ends a sentence
    When the next words come after a pause
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
