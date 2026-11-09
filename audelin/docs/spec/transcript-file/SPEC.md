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
- **Final text stays, what follows it is rewritten.** Call text revises
  what it has shown (pending text settles, segments are redone), so
  appending alone would keep the words it took back. It never revises or
  moves an entry it has made final, though, so once the file holds a
  final entry a write cuts the file back to its final text and writes
  only what follows. Until then, and when there is no text, a write
  replaces the whole file. A save late in a long call then writes about
  as much as one early in it, not the whole call.
- **A whole replacement is all or nothing:** written beside the file,
  flushed, then renamed over it, as Amanu writes its session files
  (`durableWrite`). A crash or a failed replacement leaves the last whole
  text, never part of one.
- **A rewrite keeps every final entry whole:** the file is cut back only
  to text it already holds, and the rest is written and flushed after
  that. A crash or a failed rewrite can lose or cut only the text after
  the final entries. A failed write ends nothing: the next one replaces
  the whole file. This holds when the app stops; surviving a system crash
  or power loss is not this adapter's (Apple: a returned `fsync` does not
  promise it).
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
  call's transcript, and with every write complete when it returns there
  is nothing left to do, so a close cannot fail.

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
    When the app stops in the middle of replacing it whole
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

  Scenario: S-12 Final text stays and only what follows is written
    Given a transcript holding final text
    When I write the call's text
    Then the user can read it whole, and only the text after the final text was written

  Scenario: S-13 A crash while rewriting keeps every final entry
    Given a transcript holding final text
    When the app stops in the middle of rewriting what follows it
    Then the user can read every final entry whole

  Scenario: S-14 A failed rewrite keeps every final entry
    Given a transcript holding final text
    When a rewrite fails
    Then I can tell it failed, the user can read every final entry whole, and the next write replaces the file whole
```
