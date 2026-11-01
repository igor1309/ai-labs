# Track file

Observer: Session, which opens and closes the tracks (`../session/SPEC.md`),
with the writing and reading compose connects (`../../app-shape.md`). They
keep the call's audio of user S-7, S-9 and S-17 and the catching up of S-15
(`../SPEC.md`, `../call-text/SPEC.md`). An adapter over a file on disk.

## Decided

- **Session opens and closes a track, recorded capture writes it, call
  text reads it,** each through an interface of its own that the root
  answers with the track (ARCHITECTURE rules 1 and 4; LAB-549: writing
  from the root put decisions in compose).
- **One mono file per track, at one rate, 48 kHz:** each capture fails and
  goes on alone (Session); MacParakeet keeps each source as its own 48 kHz
  mono file (`spec/05-audio-pipeline.md`). A tap's rate follows the output
  device (System audio capture, S-5), so other rates are converted.
- **Uncompressed CAF, its data chunk last and its length left open,** so
  a crash leaves a file read to its end (Apple's CAF spec: a data size of
  -1, allowed only for the last chunk); closing writes the length.
  MacParakeet's AAC keeps up to its last 1 s fragment after a kill and is
  repaired by an export when it no longer probes (`repairIfNeeded`).
  16-bit, about 5.8 MB a minute; compressing a kept call is not this one's.
- **A track's time starts at its first sample,** and reads come through
  the track, which knows how much it has written. Pieces carry no time
  (System audio capture); the client places the track in call time.
- **Opening never overwrites:** `AVAudioFile`'s writing init erases a file
  at its URL (Apple's docs), so a track creates its file only where none
  is, without erasing, and a second recording cannot erase a kept call.
  An open that fails leaves no file, so it never blocks the next one.
- **A failed write ends the track's writing** (a decision; Apple promises
  no state after a failed write): time is the samples written, so writing
  on after a lost piece would shift all later audio. Once writing ends, by
  a close or a failure, a read waiting past the end gives what was written
  of its stretch. A failed read is told to call text, whose catching up is
  its own; so is a failed close to Session.

```gherkin
Feature: Keeping a track's audio on disk

  Scenario: S-1 Written audio can be read back
    Given a track I opened
    When I write audio to it
    Then I can read that audio back by its time in the track

  Scenario: S-2 A stretch is read once it is written
    Given a track I am reading a stretch of that is not written yet
    When the audio of that stretch is written
    Then I can read the stretch

  Scenario: S-3 A read I stop waiting for ends
    Given a track I am reading a stretch of that is not written yet
    When I stop waiting
    Then I can tell the read ended without audio

  Scenario: S-4 Audio at another rate is kept at the track's rate
    Given a track I opened
    When I write audio at another rate
    Then I can read it back at the track's rate, its length kept

  Scenario: S-5 A closed track plays
    Given a track I wrote audio to
    When I close it
    Then the user can play the file and hear all of it

  Scenario: S-6 A read past the end ends with the track
    Given a read waiting past the end of what was written
    When I close the track
    Then the read gives what was written of its stretch, and no more

  Scenario: S-7 A track left open by a crash keeps its audio
    Given a track audio was written to
    When the app stops without closing it
    Then the user can play the file and hear what was written

  Scenario: S-8 A track that cannot be opened fails
    When opening a track fails, even after its file was begun
    Then I can tell it failed, no file is left, and a later open can work

  Scenario: S-9 A track never overwrites a file
    Given a file already at the place
    When I open a track there
    Then I can tell it failed, and the file is unchanged

  Scenario: S-10 A failed write is told and keeps what was written
    Given a track audio was written to
    When writing fails
    Then I can tell it failed, and later writes are refused
    And I can read and play every write that returned before
    And a read waiting past the end gives what was written

  Scenario: S-11 A read that cannot be made fails
    When reading a written stretch fails underneath
    Then I can tell the read failed

  Scenario: S-12 A failed close is told and keeps what was written
    Given a track audio was written to
    When closing it fails
    Then I can tell it failed, and the user can play what was written
```
