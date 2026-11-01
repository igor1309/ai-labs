# Calls

Observer: Recordings, which renames, deletes and moves calls through
`RecordingsCalls`, and the calls list, which reads them through compose
(`../../app-shape.md`). Together they keep user S-10, S-18 and S-19
(`../SPEC.md`). An adapter over the file system.

## Decided

- **A call is a folder directly in the calls folder whose name starts
  with the made prefix,** `yyyy.MM.dd-HHmm` and an optional `-N`, as call
  folder makes it. Anything else there (a file, a link, a folder without
  the prefix) is not a call: it is not listed and never changed.
- **The prefix is the call's id.** Call folder never reuses a name and a
  rename keeps the prefix, so the id survives a rename and a move, and two
  calls never share one. No meta file is kept: the name already says when
  the call was made, and a file beside the audio could be lost or edited
  apart from it.
- **The title is what follows the prefix and one space,** empty when
  there is none. The list shows an empty title as the bare date and time.
- **Listing gives each call its id, title, start and duration,** newest
  first by id. The start is read from the prefix in the local time zone
  given to the adapter. The duration is the longer of the two tracks'
  lengths, read from their headers; a call with no readable track has
  none, and still lists.
- **A rename takes a title, never a name.** The new name is the prefix,
  a space and the title, with `/` and `:` replaced by `-` as call folder
  does; an empty title leaves the bare prefix. A name taken by anything
  fails the rename and changes nothing (rename never replaces, so no other
  call or file is lost).
- **A delete removes the whole folder for good,** as the design's
  confirm says ("Отменить нельзя"); the app asks first. A delete that
  fails part way can leave part of the call, and says so.
- **A move takes one call into another calls folder:** copy the whole
  folder beside its place under a temporary name, check that every file's
  size matches, rename it into place, then delete the source. A failure at
  any step removes the copy and leaves the source, so a call is always
  whole in one of the two folders. A call already in the target under its
  name fails the move.
- **Counting gives the number of calls and their size in bytes,** for
  the move's confirm.
- **Every action finds its call by id at the time it runs,** so a call
  renamed in Finder is still found; a call no longer there fails the
  action.

```gherkin
Feature: Keeping recorded calls on disk

  Scenario: S-1 Calls are listed newest first
    Given calls recorded at different times
    When I list the calls
    Then I get each call's id, title, start and duration, newest first

  Scenario: S-2 What is not a call is left out
    Given a file, a link and a folder without the prefix in the calls folder
    When I list the calls
    Then none of them is listed

  Scenario: S-3 A call without readable audio still lists
    Given a call whose tracks cannot be read
    When I list the calls
    Then it is listed without a duration

  Scenario: S-4 A rename keeps the call
    Given a call
    When I rename it
    Then its folder carries the new title after the same prefix, with its files

  Scenario: S-5 A rename onto a taken name fails
    Given two calls in the same minute
    When I rename the first to a name the second has
    Then I can tell it failed, and both are unchanged

  Scenario: S-6 A delete removes the call
    Given a call
    When I delete it
    Then its folder is gone from the calls folder, with every file

  Scenario: S-7 A move keeps the call whole
    Given a call
    When I move it into another calls folder
    Then it is there with every file, under the same name, and gone from the first

  Scenario: S-8 A failed move leaves the call where it was
    Given a call and a target where the copy cannot be finished
    When I move it
    Then I can tell it failed, the call is whole where it was, and nothing is left in the target

  Scenario: S-9 A call renamed in Finder is still found
    Given a call renamed outside the app, its prefix kept
    When I rename, delete or move it by its id
    Then the action applies to it

  Scenario: S-10 A call that is gone fails the action
    Given an id whose call is no longer there
    When I rename, delete or move it
    Then I can tell it failed

  Scenario: S-11 Counting the calls
    Given calls in the calls folder
    When I count them
    Then I get their number and their size in bytes
```
