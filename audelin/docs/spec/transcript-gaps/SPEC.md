---
date: 2026-10-22
model: claude-opus-5-5
description: "Transcript gaps — how the live panel shows time a side was not captured"
---

# Transcript gaps — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 8 in
[the design](../../design/README.md); [ADR-001](../../adr-001-v1-architecture.md)
decision 5 (epochs and gaps).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A gap line names its side and its start time, «— нет звука звонка с
   14:32 —»: Screen 8 draws it so, and the time lets the user find the
   moment in the audio.
2. No sentence joins across a gap (S-1–S-3): the words either side were not
   said in one breath, and joining them invents a sentence.

## Observer

The user: the owner, or an agent running the app, reading the live panel.
The banner that explains a lost side is
[error-banners](../error-banners/SPEC.md)' S-6 and S-7; reading the panel
otherwise is [transcript-view](../transcript-view/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user sees where a side of the call was not captured

  Scenario: S-1 The Mac sleeps mid-call
    Given a recording with live text
    When the Mac sleeps and wakes during the call
    Then the user can see a gap line in «они» saying since when, with no sentence joined across it
    And the user can read the words said right before the gap

  Scenario: S-2 The microphone switches device
    Given a recording with live text
    When the user unplugs the headset the microphone was using
    Then the user can see a gap line in «я» with no sentence joined across it
    And the user can read the words said right before the gap

  Scenario: S-3 A permission is withdrawn
    Given a recording with live text
    When one side's capture permission is withdrawn
    Then the user can see a gap line in that side with no sentence joined across it
    And the user can read the words said right before the gap

  Scenario: S-4 Call audio capture fails
    Given a recording with live text
    When call audio capture fails
    Then the user can see a gap line in «они» with no sentence joined across it
    And the user can read the words said right before the gap
```
