# Transcript file

Observer: compose, which opens and closes a transcript for Session and
writes the format's rendering to it during and after a call
(`../../../ARCHITECTURE.md`, Transcript pipeline, Bleed cleanup), keeping
user S-7 and S-17 (`../SPEC.md`). An adapter over a file; it knows no Markdown.

## Decided

- **Split from the transcript format** (LAB-1140): S-1 to S-3, S-5 and
  S-11 rendered text and are retired; S-5's no-text meaning is format S-4.
- **Compose binds it to its consumers' ports:** Session's for opening and
  closing, transcript writing's for writing (rules 1 and 4).
- **A whole replacement is all or nothing:** written beside, flushed and
  renamed over the file, as Amanu's `durableWrite`.
- **A rewrite keeps the final text on disk:** the file is cut back to the
  final text it holds from its last write and the rest written and flushed.
  After any failed write, or a write telling no final text, as compose
  sends after a failed rendering, the next replaces the whole file. Holds
  when the app stops, not on power loss (`fsync` does not promise it).
- **Opening never overwrites:** the file is created only where none is,
  with the text compose opens it with, the rendering of no text. A failed
  open leaves no file.
- **Closing ends writing during the call** and cannot fail, as writes are
  complete when they return. Bleed cleanup may then replace it whole; a
  failed replacement is S-9's.

```gherkin
Feature: Keeping a call's transcript on disk

  Scenario: S-16 An opened transcript holds its first text
    When I open a transcript with text, and close it without writing
    Then I can read back that text

  Scenario: S-4 A closed transcript keeps the last text
    Given a transcript I wrote text to
    When I close it
    Then I can read back the last text I wrote

  Scenario: S-20 A closed transcript takes no more writes
    Given a transcript I closed
    When I write text to it
    Then I can tell it failed, and I can read back the last text before closing

  Scenario: S-6 A crash before a replacement lands keeps the last text
    Given a transcript text was written to
    When the app stops replacing it whole, before the new text is in place
    Then I can read back the last text whose write returned, whole

  Scenario: S-18 A crash after a replacement lands keeps the new text
    Given a transcript text was written to
    When the app stops replacing it whole, once the new text is in place
    Then I can read back the new text whole

  Scenario: S-7 A transcript that cannot be opened fails
    When opening a transcript fails, even after its file was begun
    Then I can tell it failed, no file is left, and a later open can work

  Scenario: S-8 A transcript never overwrites a file
    Given a file already at the place
    When I open a transcript there
    Then I can tell it failed, and the file is unchanged

  Scenario: S-9 A failed write is told and keeps the last text
    Given a transcript text was written to
    When a whole replacement fails
    Then I can tell it failed, and I can read back the last text whose write returned

  Scenario: S-10 A write after a failed one works
    Given a transcript whose last write failed
    When I write text
    Then I can read back that text

  Scenario: S-12 Final text stays and only what follows is written
    Given a transcript holding final text
    When I write text that starts with it
    Then I can read it back whole

  Scenario: S-13 A crash while rewriting keeps the final text
    Given a transcript holding final text
    When the app stops rewriting once the file is cut back to it
    Then I can read back the final text whole

  Scenario: S-19 A crash before a rewrite is flushed keeps its text
    Given a transcript holding final text
    When the app stops rewriting once the rest is written, before it is flushed
    Then I can read back the new text whole

  Scenario: S-14 A failed rewrite keeps the final text
    Given a transcript holding final text
    When a rewrite fails
    Then I can tell it failed, and I can read back the final text whole

  Scenario: S-15 A closed transcript is replaced whole
    Given a transcript I closed
    When I replace its text
    Then I can read back the new text whole
```
