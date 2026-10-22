---
date: 2026-10-22
model: claude-opus-5-5
description: "Settings store — the app's own settings on disk, outside the calls folder"
---

# Settings store — spec

## Oracle

Its clients' specs: [setup](../setup/SPEC.md) and
[preferences](../preferences/SPEC.md); [mvp.md](../../mvp.md) § Technical
rules (data folder).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Settings live in `~/.audelin`, as mvp.md's data folder sets (S-1).
2. A damaged settings file is kept aside and read as empty (S-3): setup then
   runs, and the damaged copy stays for a look.

## Observer

The store's clients: setup and the preferences, which read and keep
settings.

## Behaviour

```gherkin
Feature: A client keeps the app's settings

  Scenario: S-1 A setting is kept
    Given an empty settings store
    When the client saves a setting
    Then the client can read it back after a relaunch

  Scenario: S-2 Nothing saved yet
    Given an empty settings store
    When the client reads a setting
    Then the client can learn it is unset

  Scenario: S-3 A damaged settings file
    Given a settings file that cannot be read
    When the client reads the settings
    Then the client can get them all unset
    And the client can find the damaged file kept aside

  Scenario: S-4 A setting is replaced
    Given a saved setting
    When the client saves a new value for it
    Then the client can read the new value after a relaunch

  Scenario: S-5 Other settings stay
    Given two saved settings
    When the client saves one again
    Then the client can read the other unchanged after a relaunch
```
