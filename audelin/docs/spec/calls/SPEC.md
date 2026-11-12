# Calls

Observer: Recordings, which renames, deletes and moves calls, and the
calls list, which reads them through compose; they keep user S-10, S-18
and S-19. An adapter over the file system.

## Decided

- **A call is a folder directly in the calls folder whose name starts
  with the made prefix,** `yyyy.MM.dd-HHmm` and an optional `-N`, as call
  folder makes it. Anything else there (a file, a link, a folder without
  the prefix) is not a call: it is not listed and never changed.
- **The prefix is the call's id.** Call folder never reuses a name and a
  rename keeps the prefix, so the id survives a rename and a move. No meta
  file is kept: the name says when the call was made.
- **The title is what follows the prefix and one space,** or empty.
- **Listing gives each call its id, title, start and duration,** newest
  first. The start is the prefix in the given time zone; the duration is
  the longer track's, from an injected reader, or none, and it still lists.
- **A rename takes a title, never a name:** the prefix, a space and the
  title, `/` and `:` made `-`; an empty title leaves the bare prefix. A
  name taken by anything fails the rename and changes nothing.
- **A delete moves the whole folder to the Trash,** through the system
  file manager, so it can be put back from Finder. It is whole or not at
  all: one that fails leaves the folder in place and says so.
- **A move takes one call into another calls folder:** copy the whole
  folder in under a temporary name, check every file's size, rename it into
  place, then delete the source. A failure removes the copy and leaves the
  source; a call already in the target fails the move.
- **Counting gives the calls' number and size in bytes.**
- **A call's text is its notes and its transcript lines,** for search.
  Notes are `summary.md` as written, none when missing or empty. The
  transcript's lines come from an injected reader given `transcript.md`
  as written; the root passes Transcript format's, the format's one reader.
- **Every action finds its call by id at the time it runs,** so a call
  renamed in Finder is still found; one no longer there fails.

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

  Scenario: S-6 A delete moves the call to the Trash
    Given a call
    When I delete it
    Then its folder is in the Trash with every file, and gone from the calls folder

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

  Scenario: S-12 A call's text is read by its readers
    Given a call with notes and a transcript
    When I read its text
    Then I get the notes and the lines the transcript reader gives for the file
```
