---
date: 2026-10-22
model: claude-opus-5-5
description: "Live text states — the panel with live text waiting for the model, off, or switched mid-call"
---

# Live text states — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 3 (live model downloading,
live text off, text filled in after it arrives) in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Controls and
§ Edge cases.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The panel offers to switch live text on when it is off (S-3): the state
   is drawn there, and the menu is a click further away.

## Observer

The user: the owner, or an agent running the app, looking at the panel.
How filled-in minutes read is [transcript-view](../transcript-view/SPEC.md)'s
S-6; the switch itself is [switches](../switches/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user knows whether live text is coming

  Scenario: S-1 Live text waits for the model
    Given the live model is downloading and «Живой текст» is ticked
    When a recording starts
    Then the user can see the call is recorded and live text waits for the model, with its progress

  Scenario: S-2 The model arrives mid-call
    Given a recording whose live text waits for the model
    When the model finishes downloading
    Then the user can read the call live from then on, with the minutes before filled in

  Scenario: S-3 Recording without live text
    Given «Живой текст» is not ticked
    When a recording starts
    Then the user can see the call is only recorded
    And the user can switch live text on from the panel

  Scenario: S-4 Live text switched off mid-call
    Given a recording with text in the panel
    When the user unticks «Живой текст»
    Then the user can see the call is only recorded and still read the text so far

  Scenario: S-5 Live text switched on mid-call
    Given a recording with «Живой текст» not ticked and the live model ready
    When the user ticks «Живой текст»
    Then the user can read the call live from then on, with the minutes before filled in

  Scenario: S-6 Live text switched on while the model downloads
    Given a recording with «Живой текст» not ticked and the live model downloading
    When the user ticks «Живой текст»
    Then the user can see the call recorded and live text waiting for the model, with its progress
```
