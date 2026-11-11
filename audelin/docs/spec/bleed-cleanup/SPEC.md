# Bleed cleanup

Observer: compose, which runs it on each recording's closed transcript and
hands summary submission the transcript it leaves (`../../../ARCHITECTURE.md`,
Bleed cleanup). After a call on speakers, far-side speech the microphone
heard reads as the user's; cleanup keeps the user's side the user's
(LAB-1129). It owns the interfaces it cleans, hears and replaces through, and
knows nothing of the model, the recogniser or the file behind them.

## Decided

- **Shape, order and the raw transcript kept on any failure are the
  architecture's** (Bleed cleanup): this spec adds what it decides.
- **The gate counts a microphone word as leaked when the call side has the
  same word within 2 s and so does a neighbouring microphone word, and
  gates a call at 3 such words a minute** (`../../research/enhance.md`).
  The count separates the one call on speakers (15.3 a minute) from every
  call on headphones (0.0 to 0.5) by a factor of 30, and chance gives 0.03.
  An ungated call is left as recorded because the cleaning pass costs a clean
  microphone words: it kept 85 % of the owner's words on calls
  without bleed, against 92 % for denoising alone.
- **A call of no length is never gated,** since no rate can be measured.
- **Hearing nothing keeps the raw transcript,** since an empty microphone
  side would lose what the user said.
- **It tells compose what it left and why:** replaced, or kept because no
  bleed was found, nothing was heard, or a named step failed, so compose
  logs a kept raw transcript and hands summary submission the one it got.

```gherkin
Feature: Cleaning far-side bleed from a call's microphone side

  Scenario: S-1 A call without bleed is kept as recorded
    Given an ended call whose microphone shares few words with the call side
    When I clean it up
    Then I can read back the transcript as recorded, and tell no bleed was found

  Scenario: S-2 A call with bleed has its microphone side replaced
    Given an ended call whose microphone repeats the call side's words
    When I clean it up
    Then I can read back the call side as recorded and the microphone side as heard from the cleaned microphone, and tell it was replaced

  Scenario: S-3 A call of no length is kept as recorded
    Given an ended call of no length whose microphone repeats the call side's words
    When I clean it up
    Then I can read back the transcript as recorded, and tell no bleed was found

  Scenario: S-4 Cleaning failing keeps the raw transcript
    Given an ended call with bleed whose cleaning fails
    When I clean it up
    Then I can read back the transcript as recorded, and tell cleaning failed

  Scenario: S-5 Hearing failing keeps the raw transcript
    Given an ended call with bleed whose cleaned microphone cannot be heard
    When I clean it up
    Then I can read back the transcript as recorded, and tell hearing failed

  Scenario: S-6 Hearing nothing keeps the raw transcript
    Given an ended call with bleed whose cleaned microphone holds no words
    When I clean it up
    Then I can read back the transcript as recorded, and tell nothing was heard

  Scenario: S-7 Replacing failing keeps the raw transcript
    Given an ended call with bleed whose replacement fails
    When I clean it up
    Then I can read back the transcript as recorded, and tell replacing failed
```

Not cleanup's: the cleaning model, the recogniser, rendering the transcript,
writing it to disk, logging, and when summary submission runs.
