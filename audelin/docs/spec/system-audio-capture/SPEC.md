---
date: 2026-10-22
model: claude-opus-5-5
description: "System audio capture — the call's sound from the Mac's output, as the recording session's capture port"
---

# System audio capture — spec

## Oracle

Its client's specs: [recording-session](../recording-session/SPEC.md) and
[recording-faults](../recording-faults/SPEC.md);
[ADR-001](../../adr-001-v1-architecture.md) decisions 3, 5 and 10.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. It captures everything the Mac plays, not one app (S-1): a browser call
   plays through helper processes, and the user takes calls on headphones
   with nothing else playing.
2. A change of output device is an interruption with a start and end (S-6),
   as ADR-001 decision 5 sets for any device change.
3. It reports a fault with its time and kind, and never ends the process
   (S-2–S-5), as mic capture does.
4. Audio is taken unprocessed: no gain, compression or noise reduction
   (S-9), as mvp.md § Technical rules sets: the samples reach the client
   as the tap delivered them.
5. What it owns is the translation from Core Audio to the capture port:
   host times to the session clock, listener and error callbacks to faults
   and events, and Stop. The tap's behaviour is Core Audio's and is not
   re-proven here ([spec-process](../../spec-process.md) § Building).

## Observer

The capture port's client: the recording session, which records the «они»
track.

## Behaviour

```gherkin
Feature: A client captures the call's sound

  Scenario: S-1 The call's sound
    Given the system audio permission is granted
    When the client starts capture while an app plays sound
    Then the client can get that sound on the session clock it shares with the microphone

  Scenario: S-2 No permission
    Given the system audio permission is refused
    When the client starts capture
    Then the client can learn that capture was refused for want of permission

  Scenario: S-3 Permission withdrawn
    Given capture is running
    When the system audio permission is withdrawn
    Then the client can learn that capture was lost for want of permission, and when

  Scenario: S-4 Capture fails
    Given capture is running
    When the macOS audio service restarts
    Then the client can learn that capture was lost because the audio service failed, and when

  Scenario: S-5 The Mac sleeps
    Given capture is running
    When the Mac sleeps and wakes
    Then the client can learn of the interruption by sleep with its start and end
    And the client can get sound again after the wake

  Scenario: S-6 The output device changes
    Given capture is running
    When the output device changes
    Then the client can learn of the interruption with its start and end
    And the client can get sound again after it

  Scenario: S-7 Stop
    Given capture is running
    When the client stops capture
    Then the client can get no sound after the stop returns

  Scenario: S-8 Capture cannot start
    Given the system audio permission is granted and the macOS audio service is down
    When the client starts capture
    Then the client can learn that capture failed to start, and why

  Scenario: S-9 The sound is not processed
    Given the system audio permission is granted
    When the client starts capture
    Then the client can get the tap's samples as the tap delivered them
```
