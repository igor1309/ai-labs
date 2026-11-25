# Transcript origin

Observer: the user, who reads a call's transcript file and decides whether
to make it again with a newer Audelin. The transcript is owned by
`../SPEC.md`, merging by `../merge-calls/SPEC.md`, notes by
`../call-summaries/SPEC.md`; this spec owns what the file tells of its origin.

## Decided

- **The origin is front matter at the top of the transcript file** (owner's
  ruling), so it stays with the file when it is copied. Notes are made from
  the said words only; a merge reads the parts' origins to tell them.
- **The origin tells, stage by stage with the version and build that ran
  it, what a newer Audelin can change:** hearing each side, with the speech
  model; cleaning the microphone side of echo; splitting their side, with
  the diarizer kept. Speaker names, templates and notes are not origin.
- **The origin is saved in the same write as the text it tells of,** so it
  is true of the words and speakers on disk, a failed save included.
- **Each finishing stage is told once it is saved, with its outcome** and
  the version and build that saved it: done; nothing kept (no echo found,
  a failure, the split not kept); or skipped because Audelin was quitting.
  A stage not yet saved is not told, so a file can tell a saved split while
  cleaning still runs. A transcript with a stage untold is not finished:
  being finished, or cut off by a crash; finishing does not resume on launch.
- **A merged call tells each original call's origin by its start,** in
  order, and the version that merged them; remerging lists original calls,
  never an earlier merge as one, also for merges made before origins.
- **No origin is unknown, never guessed:** a transcript without one reads,
  merges and makes notes as before; in a merge its call reads unknown. Only
  the file tells the origin in this feature.

```gherkin
Feature: Telling what made a call's transcript

  Scenario: S-1 A transcript tells who heard each side
    Given a call is being recorded with live text on
    When I open its transcript file
    Then I can read the Audelin version and build, and the speech model that heard each side

  Scenario: S-2 A transcript being finished tells what is saved so far
    Given a call's far side was split and its microphone side is still being cleaned
    When I open its transcript file
    Then I can read who heard it, who split it, and that it is not finished

  Scenario: S-3 A cleaned microphone side tells it
    Given a call's microphone side was cleaned of the call's echo
    When I open its transcript file
    Then I can read the cleaned words, and the version and build that cleaned them

  Scenario: S-4 A microphone side with nothing cleaned tells it
    Given cleaning a call's microphone side kept nothing
    When I open its transcript file
    Then I can read the words as heard, and that cleaning kept nothing, by which version and build

  Scenario: S-5 A stage skipped at quit tells it
    Given I quit Audelin before a finishing stage of a call was saved
    When I open its transcript file
    Then I can read that stage as skipped, by which version and build

  Scenario: S-6 Their side split by speaker tells the diarizer
    Given a call's far side was split by speaker
    When I open its transcript file
    Then I can read which diarizer split it, by which version and build

  Scenario: S-7 Their side not split tells it
    Given splitting a call's far side by speaker kept nothing
    When I open its transcript file
    Then I can read their side unsplit, and that the split kept nothing, by which version and build

  Scenario: S-13 A failed save keeps the text and its origin together
    Given saving a call's cleaned words failed
    When I open its transcript file
    Then I can read the earlier words with the origin that told them

  Scenario: S-8 A merged call tells each call's origin
    Given I merged calls recorded by different Audelin versions
    When I open the merged call's transcript file
    Then I can read each call's origin by its start, in order, and the version that merged them

  Scenario: S-9 Merging a merged call lists its original calls
    Given I merged a merged call with another call
    When I open the result's transcript file
    Then I can read the origin of every original call, each once

  Scenario: S-10 A call without origin reads as unknown in a merge
    Given I merged a call whose transcript tells no origin with one that does
    When I open the merged call's transcript file
    Then I can read that call's origin as unknown, and the other call's origin

  Scenario: S-11 A transcript without origin reads as before
    Given a call whose transcript tells no origin
    When I open it in the calls window
    Then I can read its transcript and its notes as before

  Scenario: S-12 Notes leave the origin out
    Given a call whose transcript tells its origin
    When notes are made for it
    Then I can read notes about what was said, with nothing from the origin
```
