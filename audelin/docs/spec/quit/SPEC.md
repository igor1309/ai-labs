---
date: 2026-10-22
model: claude-opus-5-5
description: "Quit — what the user keeps when they quit Audelin, idle or mid-activity"
---

# Quit — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 7 in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Edge cases
(moves go call by call) and § v4 screen details (after a failed move).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. «Выйти» during a recording asks to confirm, then stops and keeps the
   call (S-2, S-3, S-4): a stray click must not end a call's recording.
2. «Выйти» during a folder move asks to confirm; the move then stops after
   the call it is moving (S-5, S-6, S-9): calls move one by one, so the rest
   stay whole. A move left unfinished is [settings-window](../settings-window/SPEC.md)'s
   unfinished move, with its Retry.
3. Quitting while a call's text catches up asks nothing (S-7): nothing is
   lost, as the audio is on disk. The text completing after the next launch
   is [call-screen](../call-screen/SPEC.md)'s.

## Observer

The user: the owner, or an agent running the app, choosing «Выйти».

## Behaviour

```gherkin
Feature: The user quits Audelin without losing a call

  Scenario: S-1 Quitting with nothing running
    Given nothing records and no folder move runs
    When the user chooses «Выйти» in the menu
    Then the user can see Audelin gone from the menu bar

  Scenario: S-2 Quitting during a recording asks first
    Given a recording is running
    When the user chooses «Выйти» in the menu
    Then the user can confirm quitting
    And the user can cancel quitting

  Scenario: S-3 Cancelling the quit keeps recording
    Given the user is asked to confirm quitting during a recording
    When the user cancels
    Then the user can see the recording go on

  Scenario: S-4 Quitting during a recording keeps the call
    Given the user is asked to confirm quitting during a recording
    When the user confirms and opens Audelin again
    Then the user can find the call in the calls list, playable up to the quit

  Scenario: S-5 Quitting during a folder move asks first
    Given the calls folder is being moved
    When the user chooses «Выйти» in the menu
    Then the user can confirm quitting
    And the user can cancel quitting

  Scenario: S-8 Cancelling the quit keeps moving
    Given the user is asked to confirm quitting during a folder move
    When the user cancels
    Then the user can see the move go on

  Scenario: S-6 Quitting during a folder move keeps every call
    Given the user is asked to confirm quitting with calls left after the one moving
    When the user confirms and opens Audelin again
    Then the user can find every call in the calls list
    And the user can see in Settings that the move did not finish

  Scenario: S-9 Quitting while the last call moves
    Given the user is asked to confirm quitting while the last call moves
    When the user confirms and opens Audelin again
    Then the user can see the new calls folder in Settings

  Scenario: S-7 Quitting while a call's text catches up
    Given a stopped call whose text is still catching up
    When the user chooses «Выйти» in the menu
    Then the user can see Audelin quit without asking

```
