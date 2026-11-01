# Two-pass recogniser

Observer: Live text, which feeds the two-pass recogniser one track's audio
and reads what it hears.

The two-pass recogniser hears a track with two recognisers: a draft one
that shows words fast, and a final one that reads them better but later.
It reports the final recogniser's final words, and the draft's words after
them as pending, as Live text's spec asks of a recogniser. Live text sees
one recogniser and knows nothing of the two.

## Decided

- Nemotron drafts and Parakeet makes final: on a real call Nemotron showed
  a word a median of 0.5–0.6 s after it was spoken and Parakeet 1.3–1.8 s,
  and Parakeet read the quieter side clearly better (research run 7).
  Which recognisers to pair is the client's; the two-pass recogniser takes
  any two.
- Only the final recogniser makes words final, so the settled text is its
  reading, word for word (research run 7b, with no pause settling).
- A draft word shows only after the final recogniser's final words. A
  draft word that is a final word heard again is not shown twice: the same
  letters, case, punctuation and «ё» aside, starting within 1 s of it.
  Nemotron starts a word about 0.3 s later than Parakeet (median of 79
  matched words) and a trailing punctuation token stretches its end by up
  to 5 s, so the match goes by start (run 7b).
- Each report holds the final words not reported before and every draft
  word still shown, and starts at the earliest of them or of the draft
  words last shown, so draft words the final reading replaced are gone.
- Both recognisers hear every chunk. Finishing finishes both, and
  everything the final recogniser heard is final.
- If either recogniser fails, the two-pass recogniser fails: Live text
  keeps the text so far, and restarting is the client's call.

```gherkin
Feature: Hearing a track with two recognisers

  Background:
    Given Live text is feeding the two-pass recogniser a track's audio

  Scenario: S-1 Draft words show first
    Given the draft recogniser has heard words
    And the final recogniser has heard none yet
    When I read the words
    Then I can read the draft words as pending

  Scenario: S-2 The final reading replaces the draft
    Given draft words are shown
    When the final recogniser makes its reading of them final
    Then I read the final reading, settled
    And the draft words it replaced are gone

  Scenario: S-3 Draft words after the final words stay
    Given the final recogniser has made words final
    When the draft recogniser has heard words after them
    Then I read the final words settled and the draft words after them pending

  Scenario: S-4 A word is not shown twice
    Given the final recogniser has made a word final
    When the draft recogniser heard the same word a little later
    Then I read the word once

  Scenario: S-5 Draft words change in place
    Given draft words are shown
    When the draft recogniser reads them again differently
    Then I read its new reading in their place

  Scenario: S-6 Finishing settles the final reading
    Given draft words are shown and the final recogniser has words not final
    When the audio ends
    Then I read the final recogniser's words, settled, and no draft words

  Scenario: S-7 A failing recogniser fails the two-pass recogniser
    Given words are shown
    When either recogniser fails
    Then I can tell the recogniser failed, and the text so far is kept
```

Not the two-pass recogniser's: loading the models, choosing them, segments
and pauses (Live text's).
