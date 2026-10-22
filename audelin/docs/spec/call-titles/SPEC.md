---
date: 2026-10-22
model: claude-opus-5-5
description: "Call titles — the title a call takes when its recording starts"
---

# Call titles — spec

## Oracle

[The user spec](../SPEC.md), the client; [mvp.md](../../mvp.md) § Call
folders and § Edge cases; Screen 4 in [the design](../../design/README.md).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A recording started by hand with no call app on the microphone is titled
   «Звонок» (S-3): the UI is Russian and the title is editable.
2. With two call apps on the microphone, a recording takes the one seen
   taking it first (S-4): that is the call the user joined first, and a
   second app is more often a stray tab.

## Observer

The user: the owner, or an agent running the app, reading titles in the
calls list and Finder. Changing a title is [call-rename](../call-rename/SPEC.md)'s.

## Behaviour

```gherkin
Feature: Each call starts with a title

  Scenario: S-1 A call is titled after its call app
    Given «Записывать звонки автоматически» is ticked
    When a call app's call starts a recording
    Then the user can see the call titled after that app in the calls list

  Scenario: S-2 A browser call is titled after the browser
    Given «Записывать звонки автоматически» is ticked
    When a call in a browser starts a recording
    Then the user can see the call titled after that browser in the calls list

  Scenario: S-3 A recording by hand with no call app
    Given no call app uses the microphone
    When the user starts a recording
    Then the user can see the call under the default title

  Scenario: S-4 Two call apps on the microphone
    Given two call apps use the microphone
    When the user starts a recording
    Then the user can see the call titled after the app that took the microphone first

  Scenario: S-5 A recording by hand during a call
    Given one call app uses the microphone and nothing records
    When the user starts a recording
    Then the user can see the call titled after that app

  Scenario: S-13 Two calls with one title in the same minute
    Given a call titled after a call app started this minute and was stopped
    When the user starts another recording during that app's call in the same minute
    Then the user can tell the two calls apart by their titles
```
