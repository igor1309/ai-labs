# Transcript format

Observer: compose, rendering call text live and a replaced or merged transcript after it
(`../../../ARCHITECTURE.md`), for user S-7, S-17 and `../transcript-origin/`. An adapter, the format's only writer and reader; it knows no disk.

## Decided

- **Split from the transcript file** (LAB-1140): it changes with content, the file with durability.
- **Markdown the user reads, one part per segment in call text's order,** each marked
  mine or theirs with its start in call time, as Amanu keeps `transcript.md`. Text filled
  in after live text was switched on is marked so (design, Added late). Pending renders as settled.
- **Their side's parts name the diarized speaker by a stable generic ID, never a
  name,** so final text never changes when names do (LAB-1123). The current
  names follow the parts, readable and in one versioned machine-readable block,
  rendered whole each time; while there are names, no final length is told.
- **No text, or only wordless final parts, renders as saying no text was heard.**
- **During a call, final text with words renders once:** call text never revises a
  final entry, so its rendering is kept, only what follows renders again, and the
  length of the final text is told for the file to keep. A replacement renders anew.
- **The origin is front matter above the transcript** (`../transcript-origin/`):
  each call's hearing and finishing outcomes and a merge's version, a call with
  none unknown. It renders whole every time, as the start of the final text:
  a told final length counts it; a changed origin tells none, so the file is replaced whole.
- **Reading gives back what rendering needs to render it again:** each part
  with words, side, speaker, start in whole seconds, filled-in mark and words,
  each gap as a gap, the names and the origin, if any. Other leading text is skipped.
- **A gap is a row of its own,** with no side or words, saying how long the call was cut off.
- **A failed rendering is told and keeps the final text** the next one goes on from.

```gherkin
Feature: Rendering a call's transcript

  Scenario: S-1 Rendered text can be read
    Given the call's text, mine and theirs
    When I render it
    Then I can read each part in order, marked mine or theirs, with its time

  Scenario: S-2 Revised text renders only the revision
    Given text I rendered
    When I render that text revised
    Then I can read only the revised text

  Scenario: S-3 Text filled in later is marked
    When I render text that was filled in after live text was switched on
    Then I can tell that text was filled in later

  Scenario: S-4 No text says none was heard
    When I render no text
    Then I can read that no text was heard

  Scenario: S-5 Final parts without words say none was heard
    When I render only final parts without words
    Then I can read that no text was heard

  Scenario: S-6 Final text stays the start of every rendering
    Given text I rendered with final parts that have words
    When I render it with more text after them
    Then I can read the same final text at the start, and tell how long it is

  Scenario: S-7 A failed rendering is told
    Given text I rendered with final parts
    When I render text with a segment that cannot be rendered
    Then I can tell it failed

  Scenario: S-9 Rendering after a failed one keeps the final text
    Given text I rendered with final parts, and a rendering after it that failed
    When I render good text
    Then I can read the earlier final text at its start

  Scenario: S-8 A replaced transcript renders from nothing
    Given text I rendered with final parts that have words
    When I render a replacement of that text with other final words
    Then I can read the replacement's words, and none of the earlier ones

  Scenario: S-10 Their speakers are told apart and named after the text
    When I render their parts from two speakers, with one speaker's name
    Then I can tell the speakers apart, and read each one's current name after the text

  Scenario: S-11 A rendered transcript reads back
    Given a transcript I rendered, with origin, named speakers, a gap and filled-in text
    When I read it back and render what I read
    Then I can read the same transcript

  Scenario: S-12 A gap reads as the call cut off
    When I render text with a gap of two minutes
    Then I can read at its time that the call was cut off for two minutes

  Scenario: S-13 The origin reads above the text
    When I render text with an origin
    Then I can read the origin above the transcript, and the text as without it

  Scenario: S-15 A changed origin is not kept as final
    Given text I rendered with an origin and final parts
    When I render it with another origin
    Then I can tell that no final text is kept

  Scenario: S-14 A transcript without origin reads as before
    When I read back a transcript saved before origins
    Then I can render it again as it was, with no origin
```
