---
date: 2026-10-22
model: claude-opus-5-5
description: "Live model — finding, reusing and downloading the live model, as setup, the launch check and Settings use it"
---

# Live model — spec

## Oracle

Its clients' specs: [setup-screen](../setup-screen/SPEC.md),
[launch-check](../launch-check/SPEC.md),
[settings-window](../settings-window/SPEC.md) and
[live-text-states](../live-text-states/SPEC.md); [mvp.md](../../mvp.md)
§ Screen decisions; [ADR-001](../../adr-001-v1-architecture.md) decision 12.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Another app's files are reused only on an exact match of name, size and
   checksum (S-1, S-2), as mvp.md § Screen decisions sets.
2. A failed download resumes from what it already has on retry (S-5): the
   model is large, and starting over wastes the user's time.

## Observer

The live model's clients: setup, the launch check, Settings and the live
panel, which show whether live text can run. Using the model is
[live-recognition](../live-recognition/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client gets the live model ready

  Scenario: S-1 An exact copy on this Mac
    Given another app holds the exact live model files
    When the client looks for the model
    Then the client can show the model ready with nothing to download

  Scenario: S-2 Same name, other files
    Given another app holds a different file under the live model's name
    When the client looks for the model
    Then the client can show that the model will be downloaded

  Scenario: S-3 Downloading
    Given no live model on this Mac
    When the client starts the download
    Then the client can show its progress

  Scenario: S-4 The download completes
    Given the live model is downloading
    When the download completes
    Then the client can show the model ready

  Scenario: S-5 A failed download
    Given the live model is downloading
    When the download fails
    Then the client can show why
    And the client can retry it from where it stopped

  Scenario: S-6 A reused copy disappears
    Given the live model reused another app's files
    When those files are deleted
    Then the client can show the model missing at the next check

  Scenario: S-7 Its own copy at a later launch
    Given Audelin downloaded the live model earlier
    When the client looks for the model at launch
    Then the client can show the model ready

  Scenario: S-8 Its own copy disappears
    Given Audelin downloaded the live model earlier
    When those files are deleted
    Then the client can show the model missing at the next check

  Scenario: S-9 Watching a running download
    Given the live model is downloading
    When another client starts watching it
    Then that client can show the progress so far and what follows
```
