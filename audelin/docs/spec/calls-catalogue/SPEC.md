---
date: 2026-10-22
model: claude-opus-5-5
description: "Calls catalogue — the calls in the calls folder and each call's state, as the calls list and a call's screen use it"
---

# Calls catalogue — spec

## Oracle

Its clients' specs: [calls-list](../calls-list/SPEC.md),
[call-screen](../call-screen/SPEC.md) and [call-rename](../call-rename/SPEC.md)
S-7, S-8; [mvp.md](../../mvp.md) § Call folders and § Edge cases.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A call is known by the id in its folder, never by its path (S-7, S-8),
   as mvp.md § Call folders sets, so a Finder rename keeps the call.
2. Finder changes reach the client without a relaunch (S-6, S-7): mvp.md
   lets the user rename in Finder, and a stale list shows a gone call.

## Observer

The catalogue's clients: the calls list and a call's screen. Renaming and
deleting are [call-changes](../call-changes/SPEC.md)'s, catching up
[catch-up](../catch-up/SPEC.md)'s, names [call-folder-names](../call-folder-names/SPEC.md)'.

## Behaviour

```gherkin
Feature: A client finds the calls and each call's state

  Scenario: S-1 Calls newest first
    Given calls with different start times
    When the client lists the calls
    Then the client can show them newest first, each with its date, title and duration

  Scenario: S-2 A recording call
    Given a recording is running
    When the client lists the calls
    Then the client can show that call as recording

  Scenario: S-3 A stopped call is listed at once
    Given a recording whose text is still catching up
    When it stops
    Then the client can show the call listed

  Scenario: S-4 A call folder that cannot be read
    Given a call folder whose details cannot be read
    When the client lists the calls
    Then the client can show it as unreadable, with its folder

  Scenario: S-5 A call without call audio
    Given a call recorded with the call audio not captured
    When the client lists the calls
    Then the client can show that the call has only «я»

  Scenario: S-11 A call without the microphone
    Given a call recorded with the microphone not captured
    When the client lists the calls
    Then the client can show that the call has only «они»

  Scenario: S-6 A call folder removed in Finder
    Given a listed call
    When its folder is moved to the Trash in Finder
    Then the client can show the call gone

  Scenario: S-7 A call renamed in Finder
    Given a listed call
    When its folder is renamed in Finder
    Then the client can show the same call under the new title

  Scenario: S-8 Renamed in Finder without the start time
    Given a listed call
    When its folder is renamed in Finder to a title alone
    Then the client can show the call under the date it was recorded

  Scenario: S-9 A call cut short by a crash
    Given the app died during a recording
    When the client lists the calls at the next launch
    Then the client can show the call

  Scenario: S-10 A call's text
    Given a listed call with text
    When the client opens the call
    Then the client can show its text in time order with its gaps and marks
    And the client can show the minutes that are only recorded

  Scenario: S-12 A call's folder
    Given a listed call
    When the client asks for its folder
    Then the client can show the folder in Finder

  Scenario: S-13 A call without live text
    Given a listed call recorded with live text off throughout
    When the client opens the call
    Then the client can show that the call has no live text
```
