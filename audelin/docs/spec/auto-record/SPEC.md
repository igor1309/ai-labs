---
date: 2026-10-22
model: claude-opus-5-5
description: "Auto-record — when recordings start and stop on their own, as the user sees it"
---

# Auto-record — spec

## Oracle

[The user spec](../SPEC.md), the client; [mvp.md](../../mvp.md) § Controls,
§ Call folders and § Edge cases; Screen 7 in [the design](../../design/README.md).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A browser is a call app when it is Safari, Chrome, Arc, Firefox, Edge,
   Yandex Browser, Brave or Opera: a fixed list, because macOS's https
   handlers include non-browsers. S-2 is Chrome; [call-watcher](../call-watcher/SPEC.md) covers each.
2. A recording stopped by hand while its call goes on stays stopped until
   the call ends; the next call records again (S-7, S-8): restarting it
   would undo the user's Стоп.
3. Unticking auto-record does not stop the recording it started, which
   still stops when its call ends (S-10): the switch is about calls to
   come, and Стоп ends the current one.
4. Ticking auto-record while a call app uses the microphone starts recording
   at once (S-9): ticking it is a request to record.

## Observer

The user: the owner, or an agent running the app, watching the menu bar.
How the menu shows a recording is [menu-bar](../menu-bar/SPEC.md)'s, a
recording's title [call-titles](../call-titles/SPEC.md)'s, a call met
during a folder move [calls-folder-change](../calls-folder-change/SPEC.md)'s, and a
call before the live model is ready [live-panel](../live-panel/SPEC.md)'s.

## Behaviour

```gherkin
Feature: Calls start and stop recordings on their own

  Scenario: S-1 A call app taking the microphone starts a recording
    Given «Записывать звонки автоматически» is ticked and nothing records
    When Zoom starts using the microphone
    Then the user can see a recording running

  Scenario: S-11 Telemost starts a recording
    Given «Записывать звонки автоматически» is ticked and nothing records
    When Telemost starts using the microphone
    Then the user can see a recording running

  Scenario: S-2 A browser call starts a recording
    Given «Записывать звонки автоматически» is ticked and nothing records
    When Chrome starts using the microphone
    Then the user can see a recording running

  Scenario: S-3 A call that ends stops its recording
    Given a recording that Zoom's call started
    When no call app has used the microphone for the call-end time
    Then the user can see that nothing is recording

  Scenario: S-4 A call app back within the call-end time keeps the recording
    Given a recording that Zoom's call started
    When Zoom releases the microphone and takes it again within the call-end time
    Then the user can see the same recording still running

  Scenario: S-5 Auto-record off records nothing on its own
    Given «Записывать звонки автоматически» is not ticked and nothing records
    When Zoom starts using the microphone
    Then the user can see that nothing is recording

  Scenario: S-6 A recording by hand ignores the call ending
    Given a recording the user started by hand, and Zoom then took the microphone
    When no call app has used the microphone for the call-end time
    Then the user can see the recording still running

  Scenario: S-7 A recording stopped by hand stays stopped during the call
    Given a recording that Zoom's call started
    When the user stops it while Zoom still uses the microphone
    Then the user can see that nothing records until the call ends

  Scenario: S-8 The next call records after a manual stop
    Given the user stopped a recording that Zoom's call started, and the call ended
    When Zoom starts using the microphone again
    Then the user can see a new recording running

  Scenario: S-9 Ticking auto-record during a call records it
    Given «Записывать звонки автоматически» is not ticked and nothing records
    And Zoom uses the microphone
    When the user ticks «Записывать звонки автоматически»
    Then the user can see a recording running

  Scenario: S-10 Unticking auto-record keeps the call's recording
    Given a recording that Zoom's call started
    When the user unticks «Записывать звонки автоматически»
    Then the user can see the recording running until the call ends
```
