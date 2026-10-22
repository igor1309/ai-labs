---
date: 2026-10-22
model: claude-opus-5-5
description: "Setup screen — the first launch, where the user picks the calls folder and gets the live model"
---

# Setup screen — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 1 in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Final-pass
engine (v1 setup) and § Screen decisions (exact-match reuse); [ADR-001](../../adr-001-v1-architecture.md) decision 12.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Setup can be finished while the live model downloads (S-6): recording
   may start before the model is ready (ADR-001 decision 12).
2. Setup does not ask for the microphone or system audio: macOS asks at the
   first recording, and a refusal is [error-banners](../error-banners/SPEC.md)'s.
   Asking up front would add two prompts before the user has seen why.

## Observer

The user: the owner, or an agent running the app on a Mac where Audelin
has never run. Reading a call live once the model is ready is
[transcript-view](../transcript-view/SPEC.md)'s, and a call already
recording when it arrives [live-text-states](../live-text-states/SPEC.md)' S-2.

## Behaviour

```gherkin
Feature: The user sets Audelin up on first launch

  Scenario: S-1 First launch opens setup
    Given Audelin has never run on this Mac
    When the user opens it
    Then the user can see setup with the default calls folder proposed

  Scenario: S-2 Choosing another calls folder
    Given setup is open
    When the user chooses another folder for calls
    Then the user can see that folder proposed instead
    And the user can find the first call after setup in that folder

  Scenario: S-3 A live model already on this Mac
    Given another app on this Mac holds the exact live model files
    When setup opens
    Then the user can see the model found, with nothing to download
    And the user can finish setup with the live model ready

  Scenario: S-4 A model with the same name but other files
    Given another app on this Mac holds a different file under the live model's name
    When setup opens
    Then the user can see that the model will be downloaded

  Scenario: S-5 Downloading the live model
    Given no live model on this Mac
    When the user starts setup's download
    Then the user can see the download's progress

  Scenario: S-9 The download completes after setup
    Given setup was finished while the live model downloaded
    When the download completes
    Then the user can see the live model ready in Settings

  Scenario: S-10 The download completes while setup is open
    Given the live model is downloading in setup
    When the download completes
    Then the user can see the model ready and finish setup

  Scenario: S-6 Finishing setup during the download
    Given the live model is downloading in setup
    When the user finishes setup
    Then the user can record a call while the model downloads

  Scenario: S-7 A failed download
    Given the live model is downloading in setup
    When the download fails
    Then the user can see why and retry it

  Scenario: S-8 After setup
    Given the user has finished setup
    When the user opens Audelin again
    Then the user cannot see setup
```
