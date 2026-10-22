---
date: 2026-10-22
model: claude-opus-5-5
description: "Recorder — writing each track to the call's folder in short files, readable as soon as written"
---

# Recorder — spec

## Oracle

Its clients' specs: [recording-session](../recording-session/SPEC.md),
[recording-faults](../recording-faults/SPEC.md),
[live-recognition](../live-recognition/SPEC.md), [catch-up](../catch-up/SPEC.md) and
[call-changes](../call-changes/SPEC.md) S-2; [mvp.md](../../mvp.md) §
Technical rules; [ADR-001](../../adr-001-v1-architecture.md) decision 3.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Each file holds 30 s of a track, as mvp.md § Technical rules sets, so a
   crash loses at most the last 30 s (S-4): the crash limit.
2. A track's epoch starts a new file (S-6), so no file holds audio from both
   sides of a gap.
3. Audio whose write failed is never readable (S-5, S-8), as ADR-001
   invariant 18 sets.

## Observer

The recorder's client: the Core that uses the recording-writer and
recorded-audio reader ports. Through them its recording session writes, and
its live recognition and catch-up read ranges of recorded audio.

## Behaviour

```gherkin
Feature: A client writes a call's tracks and reads them back

  Scenario: S-1 Audio is readable as written
    Given a recording into a call's folder
    When the client writes a moment of a track
    Then the client can read that moment back at once

  Scenario: S-2 Two tracks
    Given a recording of both sides
    When the client writes both tracks
    Then the client can read each track apart from the other

  Scenario: S-3 A range of a long recording
    Given a recording that has run for minutes
    When the client reads a range of a track
    Then the client can get exactly that range's audio on the session clock

  Scenario: S-4 A crash loses only the last moments
    Given a recording that has run for minutes
    When the process dies
    Then the client can read all audio older than the crash limit

  Scenario: S-5 The disk fills
    Given a recording into a call's folder
    When the disk becomes full
    Then the client can learn that the write failed, and when
    And the client can read none of the audio that failed

  Scenario: S-6 A new epoch
    Given a recording of a track
    When the client starts a new epoch on it
    Then the client can read each epoch apart, with the gap between them

  Scenario: S-7 The folder is renamed
    Given a recording into a call's folder
    When the folder is renamed
    Then the client can read later audio from the renamed folder

  Scenario: S-8 The folder vanishes
    Given a recording into a call's folder
    When the folder is deleted
    Then the client can learn that the write failed because the folder is gone, and when
    And the client can read none of the audio that failed

  Scenario: S-9 Stop
    Given a recording in progress
    When the client stops it
    Then the client can read every track's audio up to the stop
```
