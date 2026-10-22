---
date: 2026-10-22
model: claude-opus-5-5
description: "Mic capture — the owner's voice from the Mac's microphone, as the recording session's capture port"
---

# Mic capture — spec

## Oracle

Its client's specs: [recording-session](../recording-session/SPEC.md) and
[recording-faults](../recording-faults/SPEC.md);
[ADR-001](../../adr-001-v1-architecture.md) decisions 3, 5 and 10.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. It captures the macOS default input device and follows it when it changes
   (S-4): the user picks the microphone in macOS or by plugging in a
   headset, and the call app follows the same choice.
2. It reports a fault with its time and kind, and never ends the process
   (S-2, S-3, S-5): the session decides what to do, as ADR-001 decision 5
   sets.
3. Audio is taken unprocessed: no gain, compression or noise reduction
   (S-9), as mvp.md § Technical rules sets: voice processing is never
   switched on, and the samples reach the client as the device delivered
   them.
4. What it owns is the translation from Core Audio to the capture port:
   host times to the session clock, listener and error callbacks to faults
   and events, and Stop. Device behaviour is Core Audio's and is not
   re-proven here ([spec-process](../../spec-process.md) § Building).

## Observer

The capture port's client: the recording session, which records the «я»
track. Writing the audio is [recorder](../recorder/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client captures the owner's voice

  Scenario: S-1 The owner's voice
    Given the microphone permission is granted
    When the client starts capture
    Then the client can get the microphone's audio on the session clock it shares with the call audio

  Scenario: S-2 No permission
    Given the microphone permission is refused
    When the client starts capture
    Then the client can learn that capture was refused for want of permission

  Scenario: S-3 Permission withdrawn
    Given capture is running
    When the microphone permission is withdrawn
    Then the client can learn that capture was lost for want of permission, and when

  Scenario: S-4 The input device changes
    Given capture is running
    When the default input device changes
    Then the client can learn of the change, and when
    And the client can get audio from the new device

  Scenario: S-5 The Mac sleeps
    Given capture is running
    When the Mac sleeps and wakes
    Then the client can learn of the interruption by sleep with its start and end
    And the client can get audio again after the wake

  Scenario: S-6 Stop
    Given capture is running
    When the client stops capture
    Then the client can get no audio after the stop returns

  Scenario: S-7 Capture cannot start
    Given the microphone permission is granted and no input device is present
    When the client starts capture
    Then the client can learn that capture failed to start, and why

  Scenario: S-8 Capture fails mid-call
    Given capture is running
    When the macOS audio service restarts
    Then the client can learn that capture was lost because the device failed, and when

  Scenario: S-9 The voice is not processed
    Given the microphone permission is granted
    When the client starts capture
    Then the client can get the microphone's samples as the device delivered them
```
