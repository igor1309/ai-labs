---
date: 2026-10-22
model: claude-opus-5-5
description: "Switches — «Записывать звонки автоматически» and «Живой текст», in the menu and in Settings, as the user sees them"
---

# Switches — spec

## Oracle

[The user spec](../SPEC.md), the client; [mvp.md](../../mvp.md) § Controls;
Screens 6 and 7 in [the design](../../design/README.md).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The switches keep their state when the app quits and opens again (S-8):
   they are settings, and mvp.md lists them as rows in Settings.

## Observer

The user: the owner, or an agent running the app, using the menu and
Settings. What a switch changes during a call is
[auto-record](../auto-record/SPEC.md)'s and [live-panel](../live-panel/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user sets the two switches from the menu or Settings

  Scenario: S-1 Both switches start ticked
    Given Audelin has never run on this Mac
    When the user completes setup and opens the menu
    Then the user can see both switches ticked

  Scenario: S-2 Live text unticked in the menu
    Given «Живой текст» is ticked
    When the user unticks it in the menu
    Then the user can see it unticked in the menu and in Settings

  Scenario: S-3 Live text ticked in the menu
    Given «Живой текст» is not ticked
    When the user ticks it in the menu
    Then the user can see it ticked in the menu and in Settings

  Scenario: S-4 Auto-record unticked in the menu
    Given «Записывать звонки автоматически» is ticked
    When the user unticks it in the menu
    Then the user can see it unticked in the menu and in Settings

  Scenario: S-5 Auto-record ticked in the menu
    Given «Записывать звонки автоматически» is not ticked
    When the user ticks it in the menu
    Then the user can see it ticked in the menu and in Settings

  Scenario: S-6 Live text changed in Settings
    Given «Живой текст» is ticked
    When the user unticks it in Settings
    Then the user can see it unticked in the menu

  Scenario: S-7 Auto-record changed in Settings
    Given «Записывать звонки автоматически» is ticked
    When the user unticks it in Settings
    Then the user can see it unticked in the menu

  Scenario: S-9 Live text ticked in Settings
    Given «Живой текст» is not ticked
    When the user ticks it in Settings
    Then the user can see it ticked in the menu

  Scenario: S-10 Auto-record ticked in Settings
    Given «Записывать звонки автоматически» is not ticked
    When the user ticks it in Settings
    Then the user can see it ticked in the menu

  Scenario: S-8 The switches outlast a restart
    Given the user has unticked both switches
    When the user quits Audelin and opens it again
    Then the user can see both switches unticked
```
