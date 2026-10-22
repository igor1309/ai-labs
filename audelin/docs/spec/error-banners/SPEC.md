---
date: 2026-10-22
model: claude-opus-5-5
description: "Error banners — what the live panel tells the user when capture or the disk fails"
---

# Error banners — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 8 in
[the design](../../design/README.md); [ADR-001](../../adr-001-v1-architecture.md)
§ acceptance (record first; a full disk shows "recording failed").

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. When one side cannot be captured, recording goes on with the other and
   a banner names the missing side (S-1, S-2, S-6, S-7), as Screen 8 draws:
   stopping would lose the side that works.
2. A microphone that switches device raises no banner (S-8): the recording
   goes on, and the gap shows in the text.

## Observer

The user: the owner, or an agent running the app, looking at the panel.
Gap lines in the text are [transcript-gaps](../transcript-gaps/SPEC.md)'s,
and banners about live text [text-banners](../text-banners/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user learns what failed and what is still recorded

  Scenario: S-1 No call audio
    Given call audio cannot be captured
    When a recording starts
    Then the user can see that only «я» is recorded and open the macOS setting that fixes it

  Scenario: S-2 No microphone
    Given the microphone cannot be captured
    When a recording starts
    Then the user can see that only «они» is recorded and open the macOS setting that fixes it

  Scenario: S-3 Disk full
    Given a recording is running
    When the disk becomes full
    Then the user can see that recording failed and when
    And the user can open the call's folder, its audio and text kept up to then

  Scenario: S-4 No new recording on a full disk
    Given recording failed because the disk is full
    When the user looks at the panel
    Then the user cannot press Начать

  Scenario: S-5 Room on the disk again
    Given recording failed because the disk is full
    When the user frees space on the disk
    Then the user can press Начать

  Scenario: S-6 Call audio lost mid-call
    Given a recording of both sides
    When call audio stops being captured
    Then the user can see that only «я» is recorded from then on
    And the user can open the macOS setting that fixes it

  Scenario: S-7 Microphone lost mid-call
    Given a recording of both sides
    When the microphone permission is withdrawn
    Then the user can see that only «они» is recorded from then on
    And the user can open the macOS setting that fixes it

  Scenario: S-8 The microphone switches device
    Given a recording of both sides
    When the microphone switches device
    Then the user can see the recording go on with no banner

  Scenario: S-11 The calls folder vanishes
    Given a recording is running
    When the calls folder's disk is ejected
    Then the user can see that recording failed and when

  Scenario: S-12 A banner leaves the text readable
    Given a recording with text in the panel
    When any banner appears
    Then the user can still read all the text captured before it
```
