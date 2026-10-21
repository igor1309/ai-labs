---
date: 2026-10-22
model: claude-opus-5-5
description: "Debug menu — the test triggers a debug build adds to the menu, as its user sees them"
---

# Debug menu — spec

## Oracle

[The user spec](../SPEC.md) Decided 1 and S-18, the client;
[ADR-001](../../adr-001-v1-architecture.md) § acceptance (one activity on the
calls folder at a time); [mvp.md](../../mvp.md) (a debug-only setting exists).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A second trigger requests a folder move and a recording at the same
   moment (S-5): a person cannot make the two land together by hand,
   and ADR-001 asks for that race to be proven on the built app.
2. The race trigger moves the calls folder to a fresh folder next to it, so
   it needs no file dialog.
3. The hold-recogniser trigger shows a checkmark while it holds (S-3, S-4),
   so the user knows which state the build is in.
4. Two more triggers make recognition of «они» (S-6, S-7) or of «я» (S-9)
   fail on every window, so text-banners' paused-side banner can be shown
   on demand.
5. Another makes the call's text fail to save (S-8), for text-banners'
   incomplete-text banner: a file's permissions cannot fail an open file.

## Observer

The user of a debug build: the owner, or an agent testing the app. What
the user sees while the recogniser is held is the user spec's S-18; which
activity wins the race, and how the other is refused, is
[calls-folder-change](../calls-folder-change/SPEC.md)'s, which drives it with this
trigger.

## Behaviour

```gherkin
Feature: A debug build lets its user provoke faults from the menu

  Scenario: S-1 A debug build offers the test triggers
    Given a debug build is running
    When the user opens the menu
    Then the user can see the hold-recogniser, race, fail-«они» and fail-text-saves triggers

  Scenario: S-2 A release build has none
    Given a release build is running
    When the user opens the menu
    Then the user cannot find any test trigger

  Scenario: S-3 Holding the recogniser
    Given a debug build recording with «Живой текст» ticked
    When the user chooses the hold-recogniser trigger
    Then the user can see the trigger checked and no new live text arriving

  Scenario: S-4 Releasing the recogniser
    Given the user is holding the recogniser in a debug build
    When the user chooses the trigger again
    Then the user can see the trigger unchecked and live text arriving again


  Scenario: S-5 The race trigger
    Given a debug build with nothing recording and no folder move running
    When the user chooses the race trigger
    Then the user can request a recording and a folder move at the same moment

  Scenario: S-6 Failing the other side's recognition
    Given a debug build recording with «Живой текст» ticked
    When the user chooses the fail-«они» trigger
    Then the user can see the trigger checked and no new «они» text arriving

  Scenario: S-7 Ending the failure
    Given the user is failing «они» recognition in a debug build
    When the user chooses the trigger again
    Then the user can see the trigger unchecked and «они» text arriving again

  Scenario: S-8 Failing text saves
    Given a debug build recording with «Живой текст» ticked
    When the user chooses the fail-text-saves trigger
    Then the user can see the trigger checked while the recording goes on

  Scenario: S-9 Failing the owner's recognition
    Given a debug build recording with «Живой текст» ticked
    When the user chooses the fail-«я» trigger
    Then the user can see the trigger checked and no new «я» text arriving
```
