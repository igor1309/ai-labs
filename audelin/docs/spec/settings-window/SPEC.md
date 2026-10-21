---
date: 2026-10-22
model: claude-opus-5-5
description: "Settings window — what the user sees and sets in Settings, in release and debug builds"
---

# Settings window — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 6 (release build, debug
build) in [the design](../../design/README.md); [mvp.md](../../mvp.md)
§ Versions (chunk size) and § Storage.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A chunk size changed in a debug build applies from the next recording
   (S-4): changing it mid-call would split one call's text across two
   cadences.

## Observer

The user: the owner, or an agent running the app, in Settings. The
switches are [switches](../switches/SPEC.md)'s and changing the calls folder
[calls-folder-change](../calls-folder-change/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user sees and sets Audelin's settings

  Scenario: S-1 What Settings shows
    Given setup is finished
    When the user opens Settings
    Then the user can see the calls folder, the live model's state and both switches

  Scenario: S-2 No chunk size in a release build
    Given a release build
    When the user opens Settings
    Then the user cannot find a chunk size setting

  Scenario: S-3 Chunk size in a debug build
    Given a debug build
    When the user opens Settings
    Then the user can see and change the chunk size

  Scenario: S-4 A chunk size change waits for the next recording
    Given a debug build recording a call
    When the user changes the chunk size
    Then the user can see the new size take effect from the next recording

  Scenario: S-5 The live model downloading
    Given the live model is downloading
    When the user opens Settings
    Then the user can see the download's progress
```
