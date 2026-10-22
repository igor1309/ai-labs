---
date: 2026-10-22
model: claude-opus-5-5
description: "Setup — first-run setup and the launch check on the calls folder, as the setup screen and the launch check use them"
---

# Setup — spec

## Oracle

Its clients' specs: [setup-screen](../setup-screen/SPEC.md) and
[launch-check](../launch-check/SPEC.md); [mvp.md](../../mvp.md) § Final-pass
engine and § Storage and bb output; [ADR-001](../../adr-001-v1-architecture.md)
decision 12.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The default calls folder is `~/Recordings/Audelin` (S-1), as mvp.md
   § Storage and bb output sets.
2. A launch check reports every problem found, not only the first (S-8):
   one window that lists both spares the user a second launch.

## Observer

Setup's clients: the setup screen and the launch check. The live model's
state and download are [live-model](../live-model/SPEC.md)'s; the switches
and chunk size [preferences](../preferences/SPEC.md)'.

## Behaviour

```gherkin
Feature: A client sets Audelin up and checks it at launch

  Scenario: S-1 First launch
    Given Audelin has never run on this Mac
    When the client asks whether setup is needed
    Then the client can show setup with the default calls folder proposed

  Scenario: S-2 A chosen calls folder
    Given setup is open
    When the client finishes setup with another folder chosen
    Then the client can show that folder as the calls folder, created if missing

  Scenario: S-3 Setup is done once
    Given setup was finished
    When the app launches again
    Then the client can skip setup

  Scenario: S-4 Everything in place
    Given the calls folder is present and writable and the live model is ready
    When the launch check runs
    Then the client can show nothing missing

  Scenario: S-5 The calls folder is gone
    Given the calls folder is gone since the last launch
    When the launch check runs
    Then the client can show the calls folder missing
    And the client can create it again where it was
    And the client can set another calls folder

  Scenario: S-6 The calls folder cannot be written
    Given the calls folder has become read-only
    When the launch check runs
    Then the client can show that calls cannot be saved there, and why

  Scenario: S-7 The live model is gone
    Given the live model's files are gone since the last launch
    When the launch check runs
    Then the client can show the live model missing

  Scenario: S-8 Two problems at once
    Given the calls folder and the live model are both gone
    When the launch check runs
    Then the client can show both missing together

  Scenario: S-9 Accepting the default calls folder
    Given setup is open with the default calls folder proposed
    When the client finishes setup with it
    Then the client can show the default folder as the calls folder, created if missing
```
