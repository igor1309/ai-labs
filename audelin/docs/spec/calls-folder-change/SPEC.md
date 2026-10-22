---
date: 2026-10-22
model: claude-opus-5-5
description: "Calls folder change — moving every call to a new folder, its failures, and its exclusion with recording"
---

# Calls folder change — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 6 (confirm move, moving,
move failed, during a recording) in [the design](../../design/README.md);
[mvp.md](../../mvp.md) § Call folders, § Edge cases and § v4 screen details;
[ADR-001](../../adr-001-v1-architecture.md) decision 11 and § acceptance.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A call that starts during a move is not recorded, and the panel says so
   and why (S-8): mvp.md forbids the recording, and a silent skip would
   look like a missed call.
2. Of a recording and a move requested at once, the one that reached the
   app first runs (S-9, S-10): ADR-001 asks only that exactly one does.

## Observer

The user: the owner, or an agent running the app, in Settings.

## Behaviour

```gherkin
Feature: The user moves every call to a new folder

  Scenario: S-1 A move asks first
    Given nothing records and no move runs
    When the user chooses a new calls folder in Settings
    Then the user can confirm moving every call, knowing how many and how large

  Scenario: S-2 Cancelling a move
    Given the user is asked to confirm a move
    When the user cancels
    Then the user can see the old calls folder in Settings

  Scenario: S-3 A move completes
    Given the user is asked to confirm a move
    When the user confirms and the move finishes
    Then the user can see the new folder in Settings and every call in the calls list

  Scenario: S-4 A move in progress
    Given a move is running
    When the user looks at Settings
    Then the user can see how far the move has got

  Scenario: S-5 A move that fails
    Given a move is running
    When a call cannot be moved
    Then the user can see how many moved, which call failed and why
    And the user can see the old folder in Settings with a note that some calls are in the new one
    And the user can find the calls not moved in the old folder

  Scenario: S-6 Retrying a failed move
    Given a move failed and its cause is gone
    When the user presses Retry
    Then the user can see the new folder in Settings and every call in the calls list

  Scenario: S-7 No move during a recording
    Given a recording is running
    When the user chooses a new calls folder
    Then the user can see that the folder can be changed after the call

  Scenario: S-8 No recording during a move
    Given a move is running
    When a call app starts using the microphone
    Then the user can see in the panel that the call is not recorded and why

  Scenario: S-9 A recording wins a simultaneous request
    Given a debug build with nothing recording and no move running
    When the race trigger's recording request reaches the app first
    Then the user can see the recording running and the move refused

  Scenario: S-10 A move wins a simultaneous request
    Given a debug build with nothing recording and no move running
    When the race trigger's move request reaches the app first
    Then the user can see the move running and the recording refused
```
