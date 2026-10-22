# Nemotron recogniser

Observer: Live text, which feeds the Nemotron recogniser one track's audio
and reads what it hears.

The Nemotron recogniser hears speech with Nemotron 3.5, a streaming model:
it decodes the audio a chunk at a time as it comes, and reports words with their times in the track and how far they are final, as
Live text's spec asks of a recogniser.

## Decided

- Nemotron 3.5 multilingual 0.6B in 1120 ms chunks with the language set to
  Russian: the setup measured in research run 6, where a word appeared a
  median of 0.37 s after it was spoken, against 3.7 s for Parakeet.
- Nemotron times every token it shows as it decodes it (language tags are
  not shown), from the start of the audio fed, which is the start of the
  track. A token starting with the word marker starts a word; a word runs
  from its first token's start to its last token's end. In a probe over 8 s
  of the system's Russian voice, no token changed once decoded and
  finishing only added tokens after them; FluidAudio's blank rescue alone
  inserts tokens at their time, among those of the audio it is decoding.
- The last word heard may still grow: its next tokens can come with the
  next chunk, as «поэ» became «поэтому» in the probe. A word is final once
  a later word has started.
- Each report starts at the earliest word that is new, changed or was
  pending at the last report, so a word that grew or was inserted takes its
  place in Live text. Live text
  settles by time, so reports call words final only up to before the
  pending word ends; a final word overlapping it shows as final once it is.
- A chunk that decodes no new token changes nothing, and the report says
  so.
- Audio at any sample rate is converted to the 16 kHz Nemotron takes.
- Loading the model happens before Live text listens, and a failure to load
  is reported to whoever builds the recogniser, not to Live text.

```gherkin
Feature: Hearing a track with Nemotron

  Background:
    Given Live text is feeding the Nemotron recogniser a track's audio

  Scenario: S-1 Nothing is heard before a chunk's audio is in
    Given less audio than a chunk
    When more audio arrives that still falls short
    Then I can read no words yet

  Scenario: S-2 Words are heard at their time in the track
    Given a chunk's audio is in
    When Nemotron decodes it
    Then I can read its words at the times they were spoken

  Scenario: S-3 A word followed by another is final
    Given Nemotron has decoded a word and then another after it ends
    When I read the words
    Then I can read the first word as final

  Scenario: S-4 The last word heard is pending
    Given Nemotron has decoded a word and nothing after it
    When I read the words
    Then I can read that word as pending

  Scenario: S-5 A word that grows is read in its place
    Given a pending word
    When the next chunk adds to it
    Then I read the longer word in its place, once

  Scenario: S-6 A chunk with nothing new changes nothing
    Given words heard so far
    When a chunk decodes no new token
    Then I read the words as they were

  Scenario: S-7 Finishing hears the rest
    Given audio short of a chunk that Nemotron has not decoded
    When I ask the recogniser to finish
    Then I can read every word heard as final

  Scenario: S-8 Audio at another sample rate is heard
    Given a track recorded at a sample rate other than Nemotron's
    When its audio is fed
    Then I can read the words spoken in it

  Scenario: S-9 A failing model fails the recogniser
    Given a chunk's audio is in
    When Nemotron fails to decode it
    Then I can tell the recogniser failed
```

Not the Nemotron recogniser's: segments and pauses (Live text's), choosing
the model, the spelling of English terms, and recording the audio.
