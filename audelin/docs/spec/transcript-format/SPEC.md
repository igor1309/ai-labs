# Transcript format

Observer: compose, which renders call text's text for the transcript file
during a call and renders a replaced transcript after it
(`../../../ARCHITECTURE.md`, Transcript pipeline and Bleed cleanup), so the
user can read the call's transcript of user S-7 and S-17 (`../SPEC.md`).
An adapter over a file format: the only writer of the transcript's
Markdown. It knows no disk.

## Decided

- **Split from the transcript file** (LAB-1140): the format changes when what
  a transcript holds changes, the disk when durability does, and together
  they were one adapter whose spec passed 100 lines.
- **Markdown the user reads, one part per segment in call text's order,**
  each marked mine or theirs with its start in call time, as Amanu keeps
  `transcript.md`. Text call text filled in after live text was switched
  on is marked so, as the panel groups it (design, Added late). Settled
  and pending text are rendered alike: pending is the latest heard.
- **Their side's parts name the diarized speaker by a stable generic ID,
  never a name,** so final text never changes when names do (LAB-1123). The
  current names follow the parts, readable and in one versioned
  machine-readable block, rendered again each time; while there are names,
  the rendering tells no final length, so the block is only ever written whole.
- **No text renders as a transcript saying no text was heard,** so a call
  recorded with live text off still has a transcript that says so. Final
  parts without words do not count as text.
- **During a call, final text with words renders once.** Call text never revises or
  moves an entry it has made final, so its rendering is kept and only what
  follows is rendered again, and the rendering tells how much of it is
  final, which the transcript file may keep on disk. A replaced transcript
  after the call is a new rendering from nothing.
- **A failed rendering keeps the final text:** it is told, and the final
  text rendered before stays, so the next rendering goes on from it.

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
```
