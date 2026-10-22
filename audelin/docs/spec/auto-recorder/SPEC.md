---
date: 2026-10-22
model: claude-opus-5-5
description: "Auto-recorder — starting and stopping recordings for calls, as the auto-record switch and the panel use it"
---

# Auto-recorder — spec

## Oracle

Its clients' specs: [auto-record](../auto-record/SPEC.md) and
[calls-folder-change](../calls-folder-change/SPEC.md); [mvp.md](../../mvp.md)
§ Controls and § Edge cases.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A stop by hand, unticking the switch and ticking it mid-call follow
   auto-record's Decided 2–4, which carry their grounds.
2. A call refused by a folder move is reported, with its reason, to the
   client (S-9), as calls-folder-change's Decided 1 sets.

## Observer

The auto-recorder's clients: the auto-record switch and the live panel.
When a call starts and ends is [call-watcher](../call-watcher/SPEC.md)'s;
starting and stopping a recording
[recording-session](../recording-session/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client gets calls recorded on their own

  Scenario: S-1 A call starts a recording
    Given auto-record is on and nothing records
    When a call starts
    Then the client can show a recording of that call running

  Scenario: S-2 Auto-record off
    Given auto-record is off and nothing records
    When a call starts
    Then the client can show nothing recording

  Scenario: S-3 The call ends
    Given a recording that a call started
    When the call ends
    Then the client can show nothing recording

  Scenario: S-4 A recording by hand outlasts the call
    Given a recording started by hand, then a call started
    When the call ends
    Then the client can show the recording still running

  Scenario: S-5 A stop by hand holds until the call ends
    Given a recording that a call started, stopped by hand
    When the call goes on
    Then the client can show nothing recording

  Scenario: S-6 The next call records again
    Given a call whose recording was stopped by hand has ended
    When a new call starts
    Then the client can show a recording of the new call running

  Scenario: S-7 Turning auto-record on mid-call
    Given auto-record is off, a call is on and nothing records
    When the client turns auto-record on
    Then the client can show a recording of that call running

  Scenario: S-8 Turning auto-record off mid-call
    Given a recording that a call started
    When the client turns auto-record off and the call later ends
    Then the client can show the recording running until the call ends

  Scenario: S-9 A call during a folder move
    Given auto-record is on and a folder move is running
    When a call starts
    Then the client can show the call not recorded because calls are moving
```
