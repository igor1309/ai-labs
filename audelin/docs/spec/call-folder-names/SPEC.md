---
date: 2026-10-22
model: claude-opus-5-5
description: "Call folder names — turning a call's start time and title into a folder name and back"
---

# Call folder names — spec

## Oracle

Its clients' specs: [recording-session](../recording-session/SPEC.md),
[calls-catalogue](../calls-catalogue/SPEC.md) and
[call-changes](../call-changes/SPEC.md); [mvp.md](../../mvp.md) § Call
folders and § Edge cases.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The start time in a name is the Mac's local time (S-1): the user reads
   folder names in Finder, in their own time.
2. A `/`, which a folder name cannot hold, is replaced by `-` (S-6): the
   title stays readable and the folder can be created. A leading `.` needs
   nothing, since the start time comes first.
3. The next free suffix is taken: « 2», then « 3» (S-4, S-5).
4. A name keeps the start to the minute (S-2): reading it back gives that
   minute and the title as the name holds it, after any replacement (S-6)
   and with any suffix, as mvp.md takes the title from the folder.

## Observer

The names' clients: the recording session, the calls catalogue and the
call changes, which name call folders and read them back.

## Behaviour

```gherkin
Feature: A client names call folders and reads their names

  Scenario: S-1 A new call's folder name
    Given a call's start time and title
    When the client asks for its folder name
    Then the client can get the start time then the title

  Scenario: S-2 Reading a name back
    Given a folder name made from a start time and title
    When the client reads it
    Then the client can get the start minute and title it was made from

  Scenario: S-3 A name without a start time
    Given a folder renamed to a title alone
    When the client reads it
    Then the client can get the title and no start time

  Scenario: S-4 A title taken in the same minute
    Given a folder for the same minute and title exists
    When the client asks for a folder name
    Then the client can get a name that differs by a suffix

  Scenario: S-5 Two titles already taken
    Given folders for the same minute and title exist, one with a suffix
    When the client asks for a folder name
    Then the client can get a name with the next suffix

  Scenario: S-6 A title with characters a folder cannot hold
    Given a title with a slash in it
    When the client asks for its folder name
    Then the client can get a name the file system accepts
```
