---
date: 2026-10-22
model: claude-opus-5-5
description: "Recording session — starting, stopping and keeping a call's audio, as the panel and the menu use it"
---

# Recording session — spec

## Oracle

Its clients' specs: [live-panel](../live-panel/SPEC.md),
[menu-bar](../menu-bar/SPEC.md), [quit](../quit/SPEC.md) and
[calls-folder-change](../calls-folder-change/SPEC.md); [mvp.md](../../mvp.md)
§ Technical rules; [ADR-001](../../adr-001-v1-architecture.md) decisions
1–3 and 11, invariants 9, 15 and 16.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The stop limit is 5 s, as live-panel's Decided 3 sets for the user.
2. A crash loses at most the recording file being written (S-9): mvp.md
   writes each track in short files so that a damaged file bounds the loss.

## Observer

The recording session's clients: the live panel, the menu and quit, which
start and stop recordings and show their state. Capture and disk failures
are [recording-faults](../recording-faults/SPEC.md)'s; recognising the audio
[live-recognition](../live-recognition/SPEC.md)'s; listing a call
[calls-catalogue](../calls-catalogue/SPEC.md)'s; which activity holds the
gate, and races for it, [activity-gate](../activity-gate/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client records a call and gets its audio kept

  Scenario: S-1 Starting a recording
    Given nothing records and no folder move runs
    When a client starts a recording
    Then every client can show the recording running, with its title and start time

  Scenario: S-2 Stopping a recording
    Given a recording is running
    When a client stops it
    Then every client can show nothing recording within the stop limit
    And the client can get the call's audio of both tracks up to the stop

  Scenario: S-3 Stopping with the recogniser stuck
    Given a recording whose recogniser does not respond
    When a client stops it
    Then every client can show nothing recording within the stop limit

  Scenario: S-4 Stopping with no live model
    Given a recording started before the live model was ready
    When a client stops it
    Then every client can show nothing recording within the stop limit

  Scenario: S-5 Audio is readable as soon as it is written
    Given a recording is running
    When a moment of both sides has been written
    Then the client can get it before the recording file it is in is complete

  Scenario: S-6 Recording never waits for recognition
    Given a recording whose recogniser does not respond
    When both sides keep being captured
    Then the client can get all the captured audio of both tracks

  Scenario: S-7 Starting during a folder move
    Given a folder move is running
    When a client starts a recording
    Then the client can show the recording refused because calls are moving

  Scenario: S-8 A second start while recording
    Given a recording is running
    When a client starts a recording
    Then every client can still show the one recording running

  Scenario: S-9 A session ended without Stop
    Given a recording whose session ends without being stopped
    When a new session opens on the same calls folder
    Then the client can get the call's audio up to the last file written
```
