---
date: 2026-10-22
model: claude-opus-5-5
description: "Live panel — the floating window and its recording header, as the user sees them"
---

# Live panel — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 3 and the window-sizes frame
in [the design](../../design/README.md); [mvp.md](../../mvp.md) § Versions;
[ADR-001](../../adr-001-v1-architecture.md) (Stop is bounded).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Стоп also brings up the calls list with the call selected (S-6), so the
   user lands on the call they just recorded.
2. The footnote card and ⌃⌥⌘E are v2; v1 is the "no footnote" frame.
3. Стоп ends a recording within 5 s even when the recogniser or the model
   does not respond (S-13, S-14): ADR-001 leaves the limit to the spec, and
   5 s still lets the last words reach the text in the usual case.

## Observer

The user: the owner, or an agent running the app, looking at the panel.
Reading the text is [transcript-view](../transcript-view/SPEC.md)'s, a
selection [selection](../selection/SPEC.md)'s, live text on, off or waiting
[live-text-states](../live-text-states/SPEC.md)'s, and Screen 8's failures
[error-banners](../error-banners/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user follows a call in a panel that stays out of its way

  Scenario: S-1 The panel floats over a full-screen call
    Given Zoom is full screen in its own space
    When the user shows the panel
    Then the user can see the panel over the Zoom window

  Scenario: S-2 The panel does not take focus
    Given the panel shows over Zoom
    When new text arrives in the panel
    Then the user can keep typing in Zoom without clicking back into it

  Scenario: S-3 The panel resizes
    Given the panel is showing
    When the user drags its edge wider
    Then the user can read longer lines at the new width

  Scenario: S-12 Nothing recording
    Given nothing records
    When the user looks at the panel's header
    Then the user can see that nothing is recording

  Scenario: S-4 Starting from the panel
    Given nothing records
    When the user presses Начать in the panel
    Then the user can see a recording running

  Scenario: S-5 Stopping from the panel
    Given a recording is running
    When the user looks at the panel's header
    Then the user can see the running time and stop the recording with Стоп

  Scenario: S-6 Стоп lands on the call
    Given a recording is running
    When the user presses Стоп
    Then the user can see the call selected in the calls list

  Scenario: S-13 Стоп while the recogniser is stuck
    Given a recording whose recogniser has stopped responding
    When the user presses Стоп
    Then the user can see the recording stopped without waiting for the recogniser

  Scenario: S-14 Стоп before the live model is ready
    Given a recording while the live model is still downloading
    When the user presses Стоп
    Then the user can see the recording stopped without waiting for the model

  Scenario: S-7 The last call stays in the panel
    Given the owner spoke right up to Стоп in a recording with live text
    When the user looks at the panel before the next recording
    Then the user can still read the last call's text, its last words included
```
