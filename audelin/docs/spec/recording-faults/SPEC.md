---
date: 2026-10-22
model: claude-opus-5-5
description: "Recording faults — how a recording goes on, or fails, when capture or the disk fails, as the banners use it"
---

# Recording faults — spec

## Oracle

Its client's spec: [error-banners](../error-banners/SPEC.md);
[ADR-001](../../adr-001-v1-architecture.md) decisions 3 and 5, invariants
12 and 18.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A lost side does not stop the recording (S-1–S-4): error-banners'
   Decided 1, as Screen 8 draws.
2. A microphone that switches device goes on with the new device and
   reports no fault (S-5), as error-banners' Decided 2 sets; the gap is
   [live-recognition](../live-recognition/SPEC.md)'s.
3. With no room to write, capture stops at once (S-6, S-7): ADR-001
   decision 3 never passes unwritten audio on.

## Observer

The recording session's fault client: the banners, which show what failed
and what still records. Starting and stopping is
[recording-session](../recording-session/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client learns what still records when capture or the disk fails

  Scenario: S-1 Starting with no call audio
    Given call audio cannot be captured
    When a recording starts
    Then the client can show that only «я» records, and why

  Scenario: S-2 Starting with no microphone
    Given the microphone cannot be captured
    When a recording starts
    Then the client can show that only «они» records, and why

  Scenario: S-3 Call audio lost mid-call
    Given a recording of both sides
    When call audio stops being captured
    Then the client can show «они» lost since then while «я» keeps recording

  Scenario: S-4 Microphone lost mid-call
    Given a recording of both sides
    When the microphone stops being captured
    Then the client can show «я» lost since then while «они» keeps recording

  Scenario: S-5 The microphone switches device
    Given a recording of both sides
    When the microphone's device changes
    Then the client can show both sides still recording with no fault

  Scenario: S-6 The disk fills
    Given a recording is running
    When the disk becomes full
    Then the client can show the recording failed and when, with capture stopped
    And the client can get the call's audio up to the last file written

  Scenario: S-7 The calls folder vanishes
    Given a recording is running
    When the calls folder goes away
    Then the client can show the recording failed and when, with capture stopped

  Scenario: S-8 No start on a full disk
    Given the disk is full
    When the client asks whether a recording can start
    Then the client can show that it cannot, and why

  Scenario: S-9 Room on the disk again
    Given a recording failed because the disk was full
    When room is made on the disk
    Then the client can start a recording
```
