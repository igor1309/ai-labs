---
date: 2026-10-22
model: claude-opus-5-5
description: "Launch check — what the user learns at launch when the live model or the calls folder is gone"
---

# Launch check — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 2 in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Final-pass
engine ("says so at launch, not after a call") and § Screen decisions (a
reused model that disappears); [ADR-001](../../adr-001-v1-architecture.md) decision 12.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A missing live model does not stop recording (S-4): recording may start
   before the model is ready (ADR-001 decision 12), so the blocker reports
   and downloads but keeps the app usable.
2. A missing calls folder can be created again where it was or replaced by
   another (S-5): an unplugged disk and a deleted folder need different
   answers.
3. A read-only calls folder is reported at launch too (S-6): it loses the
   next call as surely as a missing one, and mvp.md wants that said at
   launch, not after a call.

## Observer

The user: the owner, or an agent running the app, opening Audelin after
setup.

## Behaviour

```gherkin
Feature: The user learns at launch what is missing

  Scenario: S-1 Everything in place
    Given the live model and the calls folder are where setup left them
    When the user opens Audelin
    Then the user can record a call with no window in the way

  Scenario: S-2 The live model is gone
    Given the live model's files are gone since the last launch
    When the user opens Audelin
    Then the user can see that the live model is missing before any call

  Scenario: S-3 A reused model is gone
    Given setup reused another app's model and that app deleted it
    When the user opens Audelin
    Then the user can see that the live model is missing

  Scenario: S-4 Downloading from the launch check
    Given the launch check reports the live model missing
    When the user starts the download it offers
    Then the user can see the download's progress
    And the user can record a call meanwhile

  Scenario: S-7 A failed download from the launch check
    Given the launch check's download is running
    When the download fails
    Then the user can see why and retry it
    And the user can record a call meanwhile

  Scenario: S-5 The calls folder is gone
    Given the calls folder is gone since the last launch
    When the user opens Audelin
    Then the user can see that the calls folder is missing
    And the user can create it again where it was
    And the user can choose another calls folder

  Scenario: S-6 The calls folder cannot be written
    Given the calls folder has become read-only
    When the user opens Audelin
    Then the user can see that calls cannot be saved there and why
```
