---
date: 2026-10-22
model: claude-opus-5-5
description: "Calls list — what the user can see in the list of calls and what it opens"
---

# Calls list — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 4 in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Controls and
§ Call folders; [ADR-001](../../adr-001-v1-architecture.md) (record first).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The list marks a call that is recording or still catching up on its text
   (S-2, S-3): without it a call with half its text looks finished.
2. A row shows the call's audio status when a side is missing (S-8): v1 has
   no player, so the list is where a one-sided call shows.
3. A call folder that cannot be read is listed as unreadable and offers only
   «Показать в Finder» (S-6): hiding it would make a call vanish.

## Observer

The user: the owner, or an agent running the app, in the calls list.
Titles are [call-titles](../call-titles/SPEC.md)'s and
[call-rename](../call-rename/SPEC.md)'s, deleting
[call-delete](../call-delete/SPEC.md)'s, an opened call
[call-screen](../call-screen/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user finds and opens calls

  Scenario: S-1 Calls newest first
    Given calls with different start times
    When the user opens the calls list
    Then the user can see them newest first, each with its date, title and duration

  Scenario: S-2 A recording call
    Given a recording is running
    When the user opens the calls list
    Then the user can see that call marked as recording

  Scenario: S-3 A call still catching up
    Given a stopped call whose text is still catching up
    When the user opens the calls list
    Then the user can see that call marked as catching up

  Scenario: S-4 A stopped call is listed while its text lags
    Given a recording whose live text has fallen behind
    When the user stops it
    Then the user can find the call in the calls list before its text catches up

  Scenario: S-5 Opening a call
    Given a call in the calls list
    When the user opens it
    Then the user can see the call's screen

  Scenario: S-6 An unreadable call
    Given a call folder whose details cannot be read
    When the user opens the calls list
    Then the user can see it listed as unreadable and show it in Finder

  Scenario: S-7 A call folder removed in Finder
    Given a call in the calls list
    When the user moves its folder to the Trash in Finder
    Then the user can no longer find the call in the calls list

  Scenario: S-8 A call with one side missing
    Given a call recorded while the call audio could not be captured
    When the user opens the calls list
    Then the user can see that the call has only «я»

  Scenario: S-9 A call cut short by a crash
    Given the app crashed during a recording
    When the user opens the app and the calls list
    Then the user can find the call

  Scenario: S-10 A call with the microphone missing
    Given a call recorded while the microphone could not be captured
    When the user opens the calls list
    Then the user can see that the call has only «они»
```
