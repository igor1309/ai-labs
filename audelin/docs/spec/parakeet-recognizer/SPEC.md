# Parakeet recogniser

Observer: Live text, which feeds the Parakeet recogniser one track's audio
and reads what it hears.

The Parakeet recogniser hears speech with Parakeet v3, which is not a
streaming model: it cuts the audio into overlapping windows of its own,
decodes each window once, and reports words with their times in the track
and how far they are final, as Live text's spec asks of a recogniser.

## Decided

- A window is a 4 s chunk with 2 s of audio on each side, decoded from a
  fresh state with no language hint: the setup measured in research runs 5
  and 6, where the delay was a median of 3.6–3.8 s and Russian came out
  clean.
- A word belongs to the window whose chunk holds its middle; a word whose
  middle lies before the chunk keeps the reading it already had. Each word
  is then read with at least 2 s of audio on each side, or as much as the
  track has.
- Words that end before a window's right context are final; words in the
  right context are pending until the next window reads them.
- The recogniser builds each report from the windows read so far, never
  sending a raw window, and starts it at its earliest word not yet final: Live
  text keeps pending words before a report's first word, and would
  otherwise keep a word the next window dropped or read a frame later.
  Words Live text already settled at a pause may open the report; Live text
  drops them itself.
- A word read on both sides of a chunk's edge, with the same letters and
  overlapping times, is one word: the recorded windows read edge words with
  times a frame or two apart.
- A word that starts before the next window does is final once that
  window is read, wherever it ends: no later window can read it, and the
  recorded windows showed Parakeet stretching a window's last word past the
  next window's start.
- Audio at any sample rate is converted to the 16 kHz Parakeet takes.
- Loading the model happens before Live text listens, and a failure to load
  is reported to whoever builds the recogniser, not to Live text.

```gherkin
Feature: Hearing a track with Parakeet

  Background:
    Given Live text is feeding the Parakeet recogniser a track's audio

  Scenario: S-1 Nothing is heard before a window's audio is in
    Given less audio than a window and its right context
    When more audio arrives that still falls short
    Then I can read no words yet

  Scenario: S-2 Words before the right context are final
    Given a window's audio is in
    When the window is read
    Then I can read its words before the right context as final

  Scenario: S-3 Words in the right context are pending
    Given a window's audio is in
    When the window is read
    Then I can read its words in the right context as pending

  Scenario: S-4 The next window reads pending words anew
    Given pending words from a window
    When the next window reads them differently
    Then I read the next window's words in their place

  Scenario: S-5 A pending word the next window does not hear is gone
    Given a pending word from a window
    When the next window hears no word there
    Then I can no longer read that word

  Scenario: S-6 Words two windows read are heard once
    Given two windows that both read words at a chunk's edge
    When both windows are read
    Then I can read each of those words once

  Scenario: S-7 A word no later window reads is final
    Given a pending word that starts before the next window does
    When the next window is read
    Then I can read that word as final

  Scenario: S-8 Finishing hears the rest
    Given audio that no window has read yet
    When I ask the recogniser to finish
    Then I can read every word in that audio as final

  Scenario: S-9 Audio at another sample rate is heard
    Given a track recorded at a sample rate other than Parakeet's
    When its audio is fed
    Then I can read the words spoken in it

  Scenario: S-10 A failing model fails the recogniser
    Given a window's audio is in
    When Parakeet fails to read the window
    Then I can tell the recogniser failed
```

Not the Parakeet recogniser's: segments and pauses (Live text's), choosing
the model, the spelling of English terms, and recording the audio.
