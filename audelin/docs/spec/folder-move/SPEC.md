---
date: 2026-10-22
model: claude-opus-5-5
description: "Folder move — moving every call to a new calls folder, as Settings uses it"
---

# Folder move — spec

## Oracle

Its client's spec: [calls-folder-change](../calls-folder-change/SPEC.md);
[mvp.md](../../mvp.md) § Call folders, § Edge cases and § v4 screen details;
[ADR-001](../../adr-001-v1-architecture.md) decision 11, invariant 16.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A call interrupted mid-copy by a crash is kept whole in the old folder,
   and the partial copy is discarded at the next launch (S-6): mvp.md
   moves calls by copy, check, delete, so the source is the safe one.
2. A new folder inside the calls folder is refused (S-8): moving the calls
   into their own subfolder would move the target into itself.

## Observer

The folder move's client: Settings, which asks to move and shows how it
goes. Refusing a recording during a move, and races between the two, are
[activity-gate](../activity-gate/SPEC.md)'s; catch-up yielding to a move
[catch-up](../catch-up/SPEC.md)'s S-6.

## Behaviour

```gherkin
Feature: A client moves every call to a new calls folder

  Scenario: S-1 What a move will take
    Given calls in the calls folder
    When the client chooses a new folder
    Then the client can show how many calls will move and how large they are

  Scenario: S-2 A move completes
    Given nothing records
    When the client moves the calls to a new folder
    Then the client can show every call in the new folder and the new folder set

  Scenario: S-3 Progress
    Given a move is running
    When calls are moved one by one
    Then the client can show how many have moved so far

  Scenario: S-4 A call cannot be moved
    Given a move is running
    When a call cannot be moved
    Then the client can show how many moved, which call failed and why
    And the client can show the old folder still set, holding the calls not moved

  Scenario: S-5 Retrying a failed move
    Given a move failed and its cause is gone
    When the client retries it
    Then the client can show every call in the new folder and the new folder set

  Scenario: S-6 A crash mid-move
    Given the app died while copying a call
    When the app launches
    Then the client can show every call whole in exactly one folder

  Scenario: S-7 No move during a recording
    Given a recording is running
    When the client moves the calls to a new folder
    Then the client can show the move refused because a call records

  Scenario: S-8 A new folder inside the calls folder
    Given calls in the calls folder
    When the client chooses a folder inside it as the new one
    Then the client can show the move refused, and why
```
