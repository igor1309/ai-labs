---
date: 2026-10-22
model: claude-opus-5-5
description: "Call rename — changing a call's title in the app or in Finder"
---

# Call rename — spec

## Oracle

[The user spec](../SPEC.md), the client; [mvp.md](../../mvp.md) § Call
folders and § Edge cases; Screens 4 and 5 (renaming inline) in
[the design](../../design/README.md).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Enter confirms an inline rename and Esc cancels it (S-1, S-2): the macOS
   convention for inline edits, as in Finder.
2. An empty title keeps the old one (S-6): a folder needs a name.

## Observer

The user: the owner, or an agent running the app, in the calls list, the
call screen and Finder.

## Behaviour

```gherkin
Feature: The user renames a call

  Scenario: S-1 Renaming in the calls list
    Given a call in the calls list
    When the user edits its title there and confirms
    Then the user can see the new title with the start time unchanged
    And the user can find the call's folder in Finder under the new title

  Scenario: S-2 Cancelling a rename
    Given the user is editing a call's title
    When the user presses Esc
    Then the user can see the old title

  Scenario: S-3 Renaming on the call screen
    Given a call's screen is open
    When the user edits its title there and confirms
    Then the user can see the new title on the screen and in the calls list
    And the user can find the call's folder in Finder under the new title, its start time kept

  Scenario: S-4 Renaming a call while it records
    Given a recording is running
    When the user renames its call
    Then the user can see the new title while the recording goes on

  Scenario: S-5 Renaming to a title taken in the same minute
    Given two calls that started in the same minute
    When the user gives the second the first one's title
    Then the user can tell the two calls apart by their titles

  Scenario: S-6 An empty title
    Given the user is editing a call's title
    When the user clears it and confirms
    Then the user can see the old title

  Scenario: S-7 Renamed in Finder
    Given a call in the calls list
    When the user renames its folder in Finder
    Then the user can see the same call under the new title

  Scenario: S-8 Renamed in Finder without the start time
    Given a call in the calls list
    When the user renames its folder in Finder to a title alone
    Then the user can see the call under the date it was recorded
```
