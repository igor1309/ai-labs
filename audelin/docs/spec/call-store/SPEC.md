---
date: 2026-10-22
model: claude-opus-5-5
description: "Call store — call folders on disk: listing, reading, creating, renaming, trashing, copying"
---

# Call store — spec

## Oracle

Its clients' specs: [calls-catalogue](../calls-catalogue/SPEC.md),
[call-changes](../call-changes/SPEC.md),
[folder-move](../folder-move/SPEC.md) and
[recording-session](../recording-session/SPEC.md); [mvp.md](../../mvp.md) §
Call folders and § Edge cases.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A copy is checked byte for byte before its source is deleted (S-7), as
   mvp.md § Edge cases moves calls: copy, check, delete.
2. Each call's details live in the `meta.json` mvp.md § Call folders lists;
   a call is known by its id there (S-4).

## Observer

The store's clients, through the call-store port: CallsCore, which lists,
changes and moves calls, and LiveSessionCore, whose recording session
creates a call and keeps its details. Recorded audio is written through the
recording-writer port this store implements; how it behaves is
[recorder](../recorder/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client keeps calls as folders on disk

  Scenario: S-1 Creating a call
    Given a calls folder
    When the client creates a call
    Then the client can find its folder with its details

  Scenario: S-2 Listing calls
    Given a calls folder with call folders
    When the client lists them
    Then the client can get each call's details

  Scenario: S-3 Unreadable details
    Given a call folder whose details are damaged
    When the client lists the calls
    Then the client can get that folder as unreadable

  Scenario: S-4 Renaming keeps the call
    Given a call folder
    When the client renames it
    Then the client can find the same call at its new name

  Scenario: S-5 Trashing a call
    Given a call folder
    When the client trashes it
    Then the client can find it in the macOS Trash

  Scenario: S-6 Changes from Finder
    Given the client watches the calls folder
    When a call folder is renamed in Finder
    Then the client can learn of the change

  Scenario: S-7 Copying a call
    Given a call folder and another calls folder
    When the client copies it there
    Then the client can delete the source only after the copy checks whole

  Scenario: S-8 A failed copy
    Given a copy to a full disk
    When the copy fails
    Then the client can find the source untouched and no partial copy

  Scenario: S-9 A call removed in Finder
    Given the client watches the calls folder
    When a call folder is moved to the Trash in Finder
    Then the client can learn that the call is gone

  Scenario: S-10 Updated details
    Given a call folder
    When the client saves the call's new details
    Then the client can list the call with those details

  Scenario: S-11 The size of the calls
    Given a calls folder with calls
    When the client asks for their total size
    Then the client can get it
```
