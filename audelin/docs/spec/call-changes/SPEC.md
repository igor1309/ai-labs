---
date: 2026-10-22
model: claude-opus-5-5
description: "Call changes — renaming and deleting a call, as the calls list and a call's screen use it"
---

# Call changes — spec

## Oracle

Its clients' specs: [call-rename](../call-rename/SPEC.md) and
[call-delete](../call-delete/SPEC.md); [mvp.md](../../mvp.md) § Call folders
and § Edge cases; [ADR-001](../../adr-001-v1-architecture.md) decision 11.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. An empty title and deleting a recording call are refused, as
   call-rename's Decided 2 and call-delete's Decided 2 set.
2. Deleting during a folder move is refused (S-8): deleting holds the
   activity gate, which the move holds (ADR-001 decision 11).

## Observer

The call changes' clients: the calls list and a call's screen. The « 2»
for a taken title is [call-folder-names](../call-folder-names/SPEC.md)';
Finder renames [calls-catalogue](../calls-catalogue/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client renames and deletes calls

  Scenario: S-1 Renaming a call
    Given a stopped call
    When the client renames it
    Then the client can show the call under the new title with its start time unchanged

  Scenario: S-2 Renaming a call while it records
    Given a recording is running
    When the client renames its call
    Then the client can show the new title while the recording goes on into the renamed call

  Scenario: S-3 A title taken in the same minute
    Given two calls that started in the same minute
    When the client gives the second the first one's title
    Then the client can show the two calls apart by their titles

  Scenario: S-4 An empty title
    Given a stopped call
    When the client renames it to an empty title
    Then the client can show the old title

  Scenario: S-5 Deleting a call
    Given a stopped call
    When the client deletes it
    Then the client can show the call gone
    And the client can point the user to its folder in the macOS Trash

  Scenario: S-6 Deleting a call in catch-up
    Given a stopped call whose text is still catching up
    When the client deletes it
    Then the client can show the call gone

  Scenario: S-7 Deleting a recording call
    Given a recording is running
    When the client deletes its call
    Then the client can show the delete refused

  Scenario: S-8 Deleting during a folder move
    Given a folder move is running
    When the client deletes a call
    Then the client can show the delete refused because calls are moving
```
