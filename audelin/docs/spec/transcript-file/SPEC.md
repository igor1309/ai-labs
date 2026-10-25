# Transcript file

Observer: Session, which opens and closes a recording's transcript through
`SessionTranscript` and needs to tell when it fails (`../session/SPEC.md`),
with the writing of call text's updates that compose connects
(`../../app-shape.md`, Data flow). Together they keep the call's
transcript of user S-7 and S-17 (`../SPEC.md`). An adapter over a file on
disk.

## Decided

- **Session opens and closes it, the root writes it.** Only the root knows
  concrete pieces (ARCHITECTURE rule 4), so it writes call text's state
  through the transcript file's own interface; no component owns a port
  for writing, as with the track file.
- **Each write replaces the whole text,** because call text revises what
  it has shown (pending text settles, segments are redone); appending
  would keep the words it took back.
- **A replacement is all or nothing:** written beside the file, flushed,
  then renamed over it, as Amanu writes its session files
  (`durableWrite`). A crash or a failed write leaves the last whole text,
  never part of one, and a failed write ends nothing: the next update
  writes the whole text again. This holds when the app stops; surviving a
  system crash or power loss is not this adapter's (Apple: a returned
  `fsync` does not promise it).
- **Markdown the user reads, one part per segment in call text's order,**
  each marked mine or theirs with its start in call time, as Amanu keeps
  `transcript.md`. Text call text filled in after live text was switched
  on is marked so, as the panel groups it (design, Added late). Settled
  and pending text are written alike: pending is the latest heard.
- **A transcript with no text is kept,** so a call recorded with live text
  off still has its transcript, saying no text was heard. Call text sends
  empty text when started off and when it finishes, so writing no text
  says the same.
- **Opening never overwrites:** the file is created only where none is,
  so a second recording cannot erase a kept call. An open that fails
  leaves no file, so it never blocks the next one.
- **Closing writes no text and ends writing:** the last write is the
  call's transcript, and with every write whole there is nothing left to
  do, so a close cannot fail.

```gherkin
Feature: Keeping a call's transcript on disk

  Scenario: S-1 Written text can be read
    Given a transcript I opened
    When I write the call's text
    Then the user can read it, each part marked mine or theirs, with its time

  Scenario: S-2 Revised text replaces what it revised
    Given a transcript I wrote text to
    When I write that text revised
    Then the user reads only the revised text

  Scenario: S-3 Text filled in later is marked
    Given a transcript I opened
    When I write text that was filled in after live text was switched on
    Then the user can tell that text was filled in later

  Scenario: S-4 A closed transcript keeps the last text
    Given a transcript I wrote text to
    When I close it
    Then the user can read the last text I wrote

  Scenario: S-5 A transcript with no text is kept
    Given a transcript I opened and wrote no text to
    When I close it
    Then the user can read that no text was heard

  Scenario: S-6 A crash keeps the last whole text
    Given a transcript text was written to
    When the app stops in the middle of a write
    Then the user can read the last text whose write returned, or the new one, whole

  Scenario: S-7 A transcript that cannot be opened fails
    When opening a transcript fails, even after its file was begun
    Then I can tell it failed, no file is left, and a later open can work

  Scenario: S-8 A transcript never overwrites a file
    Given a file already at the place
    When I open a transcript there
    Then I can tell it failed, and the file is unchanged

  Scenario: S-9 A failed write is told and keeps the last text
    Given a transcript text was written to
    When a write fails
    Then I can tell it failed, and the user can read the last text whose write returned

  Scenario: S-10 A write after a failed one works
    Given a transcript whose last write failed
    When I write the call's text
    Then the user can read that text

  Scenario: S-11 Writing no text keeps saying none was heard
    Given a transcript I opened
    When I write no text
    Then the user can read that no text was heard
```
