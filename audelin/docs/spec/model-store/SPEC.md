---
date: 2026-10-22
model: claude-opus-5-5
description: "Model store — finding, checking and downloading the live model's files, as the live model's port"
---

# Model store — spec

## Oracle

Its client's spec: [live-model](../live-model/SPEC.md);
[mvp.md](../../mvp.md) § Screen decisions;
[ADR-001](../../adr-001-v1-architecture.md) decision 12.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. It looks for other apps' copies in FluidAudio's shared model cache (S-1):
   FluidAudio is the engine both Audelin and those apps use.
2. A downloaded file is checked like a reused one, by name, size and
   checksum (S-5): a broken download must not pass as ready.

## Observer

The store's client: the live model core, which shows whether the model is
ready.

## Behaviour

```gherkin
Feature: A client finds or downloads the live model's files

  Scenario: S-1 An exact copy
    Given FluidAudio's cache holds the exact files
    When the client looks for the model
    Then the client can get those files as the model

  Scenario: S-2 A mismatched copy
    Given FluidAudio's cache holds files with the model's name but other contents
    When the client looks for the model
    Then the client can learn there is no usable copy

  Scenario: S-3 Download progress
    Given no usable copy
    When the client downloads the model
    Then the client can follow the download's progress

  Scenario: S-4 Resuming a download
    Given a download cut off partway
    When the client downloads again
    Then the client can find it resumed from where it stopped

  Scenario: S-5 A broken download
    Given a download whose file arrives damaged
    When the download ends
    Then the client can learn the model is not ready, and why

  Scenario: S-6 A reused copy removed
    Given the model is a reused copy
    When its files are deleted
    Then the client can learn the model is missing

  Scenario: S-7 A download completes
    Given no usable copy
    When the download ends with every file whole
    Then the client can get the downloaded files as the model

  Scenario: S-8 A download cut off for good
    Given a download in progress
    When the connection drops and does not come back
    Then the client can learn that the download failed, and why

  Scenario: S-9 Its own copy at a later launch
    Given the client downloaded the model earlier
    When a new client looks for the model
    Then the client can get the downloaded files as the model

  Scenario: S-10 Its own copy removed
    Given the model is a downloaded copy
    When its files are deleted
    Then the client can learn the model is missing
```
