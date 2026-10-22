---
date: 2026-10-22
model: claude-opus-5-5
description: "Call screen — what the user can read and do on a recorded call's screen in v1"
---

# Call screen — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 5 in
[the design](../../design/README.md), v1 part; [mvp.md](../../mvp.md)
§ Versions and § Controls; [ADR-001](../../adr-001-v1-architecture.md) decision 2.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. In v1 the screen shows the title, date, duration, the folder with
   «Показать в Finder», and the live text (S-1). Screen 5's final pass,
   summary and their files are v3.
2. The text carries the panel's marks: gaps, «дописано позже» and
   incomplete (S-8, S-9, S-10, S-12), so a reader of a past call is not misled.
3. The text is selectable and copyable here as in the panel (S-11).

## Observer

The user: the owner, or an agent running the app, on a call's screen.
Renaming is [call-rename](../call-rename/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user reads a recorded call

  Scenario: S-1 Opening a call
    Given a stopped call with live text
    When the user opens it from the calls list
    Then the user can read its text with its title, date and duration

  Scenario: S-2 Showing the call in Finder
    Given a call's screen is open
    When the user presses «Показать в Finder»
    Then the user can see the call's folder in Finder

  Scenario: S-3 A call still catching up
    Given a stopped call whose text is still catching up
    When the user opens it
    Then the user can see that its text is still catching up

  Scenario: S-4 The text completes on the open screen
    Given a call's screen is open while its text catches up
    When the text catches up
    Then the user can read the call's whole text there

  Scenario: S-5 A new recording interrupts catch-up
    Given a stopped call whose text is still catching up
    When a new recording starts and later stops
    Then the user can read the earlier call's whole text

  Scenario: S-6 A folder move interrupts catch-up
    Given a stopped call whose text is still catching up
    When the user moves the calls folder
    Then the user can read the earlier call's whole text in the new folder

  Scenario: S-7 A call recorded without live text
    Given a call recorded with «Живой текст» not ticked throughout
    When the user opens it
    Then the user can see that the call has no live text

  Scenario: S-8 A gap in a past call
    Given a call whose audio was interrupted
    When the user opens it
    Then the user can see the gap where audio was missing

  Scenario: S-9 Late text in a past call
    Given a call whose live text started after the call began
    When the user opens it
    Then the user can see those minutes marked «дописано позже»

  Scenario: S-10 Text that could not be saved
    Given a call whose text could not be saved to its folder
    When the user opens it
    Then the user can see the text marked incomplete

  Scenario: S-11 Copying from a past call
    Given a call's screen is open
    When the user selects a passage and copies it
    Then the user can paste the passage elsewhere

  Scenario: S-12 Live text switched off mid-call
    Given a call whose live text was switched off partway through
    When the user opens it
    Then the user can read the text up to the switch and see the rest was only recorded
```
