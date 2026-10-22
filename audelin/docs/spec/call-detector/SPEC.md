---
date: 2026-10-22
model: claude-opus-5-5
description: "Call detector — which apps take and release the microphone, as the call watcher's port"
---

# Call detector — spec

## Oracle

Its client's spec: [call-watcher](../call-watcher/SPEC.md);
[mvp.md](../../mvp.md) § Controls;
[ADR-001](../../adr-001-v1-architecture.md) decision 10.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Audelin's own use of the microphone is never reported (S-4): Audelin
   records the microphone, and seeing itself would hold every call open.
2. Apps already on the microphone when it starts are reported at once (S-5),
   so a call joined before launch is caught.

## Observer

The detector's client: the call watcher, which decides which of the reported
apps are calls.

## Behaviour

```gherkin
Feature: A client learns which apps use the microphone

  Scenario: S-1 An app takes the microphone
    Given the detector is running
    When an app starts using the microphone
    Then the client can learn which app, and when

  Scenario: S-2 An app releases the microphone
    Given an app uses the microphone
    When it stops using it
    Then the client can learn which app, and when

  Scenario: S-3 A browser
    Given the detector is running
    When a browser tab starts using the microphone
    Then the client can learn the browser as the app

  Scenario: S-4 Audelin itself
    Given the detector is running
    When Audelin starts capturing the microphone
    Then the client can learn of no app

  Scenario: S-5 Apps already on the microphone
    Given an app uses the microphone
    When the detector starts
    Then the client can learn of that app at once

  Scenario: S-6 A second app joins
    Given an app uses the microphone
    When a second app starts using it
    Then the client can learn of the second app apart from the first

  Scenario: S-7 One of two apps releases
    Given two apps use the microphone
    When the first stops using it
    Then the client can learn that only the first released it
```
