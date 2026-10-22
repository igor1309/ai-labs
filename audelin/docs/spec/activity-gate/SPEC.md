---
date: 2026-10-22
model: claude-opus-5-5
description: "Activity gate — which activity may write into call folders at a time"
---

# Activity gate — spec

## Oracle

Its clients' specs: [recording-session](../recording-session/SPEC.md),
[auto-recorder](../auto-recorder/SPEC.md), [catch-up](../catch-up/SPEC.md),
[call-changes](../call-changes/SPEC.md) and
[folder-move](../folder-move/SPEC.md);
[ADR-001](../../adr-001-v1-architecture.md) decision 11, invariant 16.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Of two requests at once, the one that reaches the gate first holds it
   (S-6), as calls-folder-change's Decided 2 sets.
2. Deleting a call shares the gate with a recording into another call
   (S-7): they write into different folders, and ADR-001 excludes only a
   recording and a move.

## Observer

The gate's clients: the cores that write into call folders.

## Behaviour

```gherkin
Feature: A client takes the right to write into call folders

  Scenario: S-1 A free gate
    Given nothing holds the gate
    When a client asks for it
    Then the client can hold it

  Scenario: S-2 A recording refuses a move
    Given a recording holds the gate
    When a folder move asks for it
    Then the move can learn it is refused because a call records

  Scenario: S-3 A move refuses a recording
    Given a folder move holds the gate
    When a recording asks for it
    Then the recording can learn it is refused because calls are moving

  Scenario: S-4 Catch-up yields
    Given catch-up holds the gate
    When any other client asks for it
    Then that client can hold it once catch-up has yielded

  Scenario: S-5 Release
    Given one client alone holds the gate
    When it releases the gate
    Then a waiting catch-up can hold it

  Scenario: S-6 Two requests at once
    Given nothing holds the gate
    When a recording and a move ask for it at the same moment
    Then exactly one can hold it and the other can learn why it is refused

  Scenario: S-7 A delete during a recording
    Given a recording holds the gate
    When a delete of another call asks for it
    Then the delete can go ahead

  Scenario: S-8 A move refuses a delete
    Given a folder move holds the gate
    When a delete asks for it
    Then the delete can learn it is refused because calls are moving

  Scenario: S-9 A delete releases during a recording
    Given a recording and a delete hold the gate, and catch-up waits
    When the delete releases the gate
    Then catch-up can hold it only once the recording releases too

  Scenario: S-10 Catch-up waits out a move
    Given a folder move holds the gate
    When catch-up asks for it
    Then catch-up can hold it only once the move releases
```
