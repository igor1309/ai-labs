---
date: 2026-10-22
model: claude-opus-5-5
description: "Audelin v1 — the user's journeys across the app: a call recorded, read live and kept, through a crash and a stalled recogniser"
---

# Audelin v1 — spec

## Oracle

[mvp.md](../mvp.md), [the design](../design/README.md) and
[ADR-001](../adr-001-v1-architecture.md), at `550b87a7`.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Debug builds add a menu trigger that holds the recogniser (S-18); release
   builds do not. mvp.md already keeps a debug-only setting (chunk size).

## Observer

The user: the owner, or an agent running the app on this Mac. They see the
menu bar item, the live panel, the calls list, settings and the call
folders in Finder.

## Non-goals

- The final pass, summaries, bb, calendar titles and Import (v2–v3).
- Compaction, retention, pinning and «Распознать заново» (v3 and Later).
- Any access to calls other than the app's windows and the call folders.
- Echo cancellation: calls are taken on headphones.
- Resuming a call's live text after a crash.

## Specs it composes

Each screen's behaviour is in its own spec and is not repeated here:
[menu-bar](menu-bar/SPEC.md), [switches](switches/SPEC.md),
[auto-record](auto-record/SPEC.md), [call-titles](call-titles/SPEC.md),
[debug-menu](debug-menu/SPEC.md), [quit](quit/SPEC.md),
[live-panel](live-panel/SPEC.md), [live-text-states](live-text-states/SPEC.md),
[error-banners](error-banners/SPEC.md),
[transcript-view](transcript-view/SPEC.md) (reading both sides, gaps,
late text), [selection](selection/SPEC.md),
[calls-list](calls-list/SPEC.md), [call-rename](call-rename/SPEC.md),
[call-delete](call-delete/SPEC.md), [call-screen](call-screen/SPEC.md),
[setup-screen](setup-screen/SPEC.md) and
[settings-window](settings-window/SPEC.md). A stopped call's text
completing, also when a new recording or a folder move interrupts it, is
[call-screen](call-screen/SPEC.md)'s. This spec holds only the journeys
that cross them.

## Behaviour

```gherkin
Feature: The user records a call, reads it live and keeps it

  Scenario: S-1 A call records itself and reads live
    Given «Записывать звонки автоматически» and «Живой текст» are ticked
    And the live model is ready
    When the user joins a Zoom call
    Then the user can see from the menu bar that a recording named after Zoom is running
    And the user can read both sides of the call in the live panel while it goes on

  Scenario: S-2 A call that ends is kept
    Given a recording that a Zoom call started, with live text
    When the Zoom call ends
    Then the user can find the call with its audio and text in the calls list
    And the user can still read the call in the live panel

  Scenario: S-7 English terms in Russian speech read as spoken
    Given a recording with «Живой текст» ticked and the live model ready
    When the owner says RACI, OKR and SLA in a Russian sentence
    Then the user can read RACI, OKR and SLA in Latin letters in the call's text

  Scenario: S-16 Each call has its own folder
    Given a call in the calls list
    When the user opens the calls folder from the menu
    Then the user can find the call's folder in Finder by its start time and title

  Scenario: S-18 A stalled recogniser does not stop recording
    Given a recording with «Живой текст» ticked and the live model ready
    When the recogniser stops responding and then recovers
    Then the user can see the recording go on
    And the user can later read the text of the stalled time with no words twice and none missing

  Scenario: S-19 A crash keeps the call
    Given a recording with «Живой текст» ticked and the live model ready
    When the app crashes and the user opens it again
    Then the user can find the call in the calls list with its audio up to the crash
    And the user can read its text once recognition has caught up, with no words twice and none missing

  Scenario: S-26 A fresh install reaches a working live panel
    Given Audelin has never run on this Mac
    When the user completes setup
    Then the user can record a call and read it live
```
