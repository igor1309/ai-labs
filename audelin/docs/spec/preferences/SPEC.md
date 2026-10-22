---
date: 2026-10-22
model: claude-opus-5-5
description: "Preferences — the two switches and the debug chunk size, as the menu and Settings use them"
---

# Preferences — spec

## Oracle

Its clients' specs: [switches](../switches/SPEC.md) and
[settings-window](../settings-window/SPEC.md); [mvp.md](../../mvp.md)
§ Controls and § Technical rules (chunk size).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A chunk size change applies from the next recording (S-5), as
   settings-window's Decided 1 sets.

## Observer

The preferences' clients: the menu and Settings, which show and change the
switches and the chunk size. What the switches do is
[auto-recorder](../auto-recorder/SPEC.md)'s and
[live-recognition](../live-recognition/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client reads and changes the switches and the chunk size

  Scenario: S-1 Both switches on by default
    Given Audelin has never run on this Mac
    When the client reads the switches
    Then the client can show both on

  Scenario: S-2 A switch change reaches every client
    Given two clients show the switches
    When one changes a switch
    Then the other client can show the change at once

  Scenario: S-3 Switches survive a relaunch
    Given the user changed a switch
    When the app launches again
    Then the client can show the switch as the user left it

  Scenario: S-4 The default chunk size
    Given a release build
    When the client reads the chunk size
    Then the client can show the default, with no way to change it

  Scenario: S-5 A chunk size change waits for the next recording
    Given a debug build recording a call
    When the client changes the chunk size
    Then the client can show the old size in use until the recording stops
    And the client can show the new size in use by the next recording

  Scenario: S-6 Changing the chunk size while idle
    Given a debug build with nothing recording
    When the client changes the chunk size
    Then the client can show the new size
```
