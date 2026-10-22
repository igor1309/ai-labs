---
date: 2026-10-22
model: claude-opus-5-5
description: "Call watcher — when a call starts and ends, and which app it is, as auto-recording and titles use it"
---

# Call watcher — spec

## Oracle

Its clients' specs: [auto-record](../auto-record/SPEC.md) and
[call-titles](../call-titles/SPEC.md), through
[auto-recorder](../auto-recorder/SPEC.md) and
[recording-session](../recording-session/SPEC.md); [mvp.md](../../mvp.md)
§ Controls; [ADR-001](../../adr-001-v1-architecture.md) decision 10 (call
detection port).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The call-end time is 30 s after the last call app releases the
   microphone (S-5, S-6), as mvp.md § Controls sets.
2. Which apps are call apps is auto-record's Decided 1; the default title
   and the first app's title are call-titles' Decided 1 and 2. A title
   comes from the apps on the microphone now, not from the call (S-8, S-9).

## Observer

The call watcher's clients: the auto-recorder, which starts and stops
recordings for calls, and the recording session, which titles a new
recording. Telling apart two titles in one minute is
[call-folder-names](../call-folder-names/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client learns when a call starts and ends, and whose it is

  Scenario: S-1 A call app takes the microphone
    Given no call is on
    When a call app starts using the microphone
    Then the client can learn that a call started in that app

  Scenario: S-2 A browser takes the microphone
    Given no call is on
    When a browser starts using the microphone
    Then the client can learn that a call started in that browser

  Scenario: S-3 Another app takes the microphone
    Given no call is on
    When an app that is not a call app starts using the microphone
    Then the client can learn of no call

  Scenario: S-4 The call ends
    Given a call is on in a call app
    When no call app has used the microphone for the call-end time
    Then the client can learn that the call ended

  Scenario: S-5 The app is back within the call-end time
    Given a call is on in a call app
    When the app releases the microphone and takes it again within the call-end time
    Then the client can learn of the same call still on

  Scenario: S-6 Two call apps
    Given a call is on in one call app
    When a second call app starts using the microphone
    Then the client can still get the first app's title
    And the client can learn of the call ending only when neither uses the microphone

  Scenario: S-7 A title with a call app on the microphone
    Given a call app uses the microphone
    When the client asks for a title for a new recording
    Then the client can get that app's title

  Scenario: S-8 A title with no call app on the microphone
    Given no call app uses the microphone
    When the client asks for a title for a new recording
    Then the client can get the default title

  Scenario: S-9 The first app leaves, the second stays
    Given two call apps use the microphone
    When the first releases it
    Then the client can get the second app's title
```
