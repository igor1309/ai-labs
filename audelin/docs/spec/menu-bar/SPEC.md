---
date: 2026-10-22
model: claude-opus-5-5
description: "Menu bar — what the user can see and do from Audelin's menu bar item"
---

# Menu bar — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 7 in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Controls.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The first line reads «Ждёт звонка» with auto-record on and «Не записывает»
   with it off (S-1, S-2), as Screen 7 notes.

## Observer

The user: the owner, or an agent running the app, using the menu bar item.

## Non-goals

The two checkmark items are [switches](../switches/SPEC.md)'s, debug-build
triggers [debug-menu](../debug-menu/SPEC.md)'s, and when recordings start and
stop on their own [auto-record](../auto-record/SPEC.md)'s. Each window the
menu opens has its own spec, and «Выйти» is [quit](../quit/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user sees and controls recording from the menu bar

  Scenario: S-1 Waiting for a call
    Given «Записывать звонки автоматически» is ticked and nothing records
    When the user opens the menu
    Then the user can see that Audelin waits for a call

  Scenario: S-2 Auto-record off
    Given «Записывать звонки автоматически» is not ticked and nothing records
    When the user opens the menu
    Then the user can see that Audelin is not recording

  Scenario: S-15 Nothing recording shows in the bar
    Given a recording has just stopped
    When the user looks at the menu bar from another app
    Then the user can see that nothing records

  Scenario: S-13 Recording by hand with auto-record off
    Given «Записывать звонки автоматически» is not ticked and nothing records
    When the user chooses «Начать запись» in the menu
    Then the user can see a recording running

  Scenario: S-14 Recording by hand while waiting for a call
    Given «Записывать звонки автоматически» is ticked and nothing records
    When the user chooses «Начать запись» in the menu
    Then the user can see a recording running

  Scenario: S-3 A recording is visible from any app
    Given a recording of a Zoom call is running
    When the user looks at the menu bar from another app
    Then the user can see the recording mark and its running time

  Scenario: S-4 Stopping from the menu
    Given a recording of a Zoom call is running
    When the user opens the menu
    Then the user can see that the Zoom call is recording and for how long
    And the user can stop the recording

  Scenario: S-5 Recording without live text
    Given a recording with «Живой текст» not ticked
    When the user opens the menu
    Then the user can see that the call records without text

  Scenario: S-7 The menu opens the calls list
    Given the menu is open
    When the user chooses «Звонки…»
    Then the user can see the calls list

  Scenario: S-8 The menu opens the calls folder
    Given the menu is open
    When the user chooses «Открыть папку звонков»
    Then the user can see the calls folder in Finder

  Scenario: S-9 The menu opens the live panel
    Given the live panel is closed
    When the user chooses «Показать панель» in the open menu
    Then the user can see the live panel

  Scenario: S-10 The menu opens Settings
    Given the menu is open
    When the user chooses «Настройки…»
    Then the user can see Settings

```
