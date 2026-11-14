# Calls — merging calls

Observer: compose, which answers Recordings' merge port by chaining Calls
with Transcript format, Transcript join and Transcript file
(`../../../ARCHITECTURE.md`, Merging calls); it keeps user merging calls
(`../merge-calls/SPEC.md`). Merging is part of the Calls adapter, specified
here so each spec stays within 100 lines; finding a call by id, the Trash
and moves hold as in `../calls/SPEC.md`.

## Decided

- **A merged call is a call folder holding its parts' folders whole,** with
  the joined `transcript.md` beside them. Its name is the earliest part's,
  so it keeps that part's id, start and title. The parts' files, audio
  included, are never changed.
- **Only top-level call folders are listed,** so the parts leave the list
  and the merged call takes their place.
- **A merge is prepared out of sight:** in a folder whose name has no
  prefix, so it is never listed. The joined transcript is written there,
  each part's folder is renamed into it, and last it is renamed to the
  earliest part's name. Renames stay on one volume, so no file is copied.
- **A merge is whole or not at all.** It is recorded before any part
  moves, as a move is; a failure moves the parts back out and removes the
  prepared folder. An interrupted merge is put back the same way when Calls
  starts, before its first listing, unless the merged call is in place. A
  merge under way is never undone by a listing; it is only renames, and
  Recordings lists again after its outcome.
- **A merged call's duration is its span,** from the earliest start to the
  latest end of any part's longer track, a merged part's parts included.
- **Every part needs a known length,** read from its tracks, so its gap can
  be placed; a part without one fails the merge, named, before anything
  moves.
- **Rename, delete, move and text treat a merged call as any call:** delete
  sends it to the Trash with its parts, a move carries them, and its text
  is its joined transcript and its own notes.

```gherkin
Feature: Keeping merged calls on disk

  Scenario: S-1 A merged call takes its parts' place
    Given two calls and a joined transcript of both
    When I merge them
    Then the list holds one call with the earliest part's id, title and start, and not the parts

  Scenario: S-2 The parts are kept whole
    Given two calls I merged
    When I look inside the merged call
    Then I find each part's folder with every file as it was

  Scenario: S-3 A merged call reads as one
    Given two calls I merged
    When I read the merged call's text
    Then I get the joined transcript's lines, not the parts'

  Scenario: S-4 A merged call's duration spans its parts
    Given merged calls of which an earlier one ends last
    When I list the calls
    Then the merged call's duration runs from the earliest start to the latest end

  Scenario: S-5 A merge being prepared is not listed
    Given a merge prepared but not yet in place
    When I list the calls
    Then the prepared folder is not listed and the merge goes on

  Scenario: S-6 A failed merge leaves the parts
    Given a merge that fails after a part moved
    When it ends
    Then every part is listed where it was, with its files, and I can tell why

  Scenario: S-7 An interrupted merge is put back
    Given a merge interrupted after a part moved
    When Calls starts
    Then every part is listed where it was, with its files

  Scenario: S-8 A merged call is deleted with its parts
    Given a merged call
    When I delete it
    Then it is in the Trash with its parts inside

  Scenario: S-9 A merged call moves with its parts
    Given a merged call
    When I move it to another calls folder
    Then it is there with its parts inside and listed as one call

  Scenario: S-10 A part without a known length is not merged
    Given a call whose tracks cannot be read
    When I merge it with another
    Then nothing moves and I can tell which call has no known length
```
