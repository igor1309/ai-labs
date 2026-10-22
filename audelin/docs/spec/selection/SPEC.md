---
date: 2026-10-22
model: claude-opus-5-5
description: "Selection — a selection in the live panel that holds while the text keeps changing"
---

# Selection — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 3 (selection survives
appends) in [the design](../../design/README.md); [mvp.md](../../mvp.md)
§ Versions ("stays selectable"); [ADR-001](../../adr-001-v1-architecture.md)
§ acceptance (selection survives appends, in-place replacement and late insertion).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. When selected words are replaced by different words, the selection
   covers the words now in their place (S-4): ADR-001 asks it to survive
   replacement, and the user selected a stretch of speech, not a spelling.
2. A copy across paragraphs keeps each paragraph's time and speaker (S-6):
   without them a pasted passage loses who said what.
3. While a selection exists the panel does not scroll to new text (S-5):
   scrolling would carry the selection away from the pointer mid-copy. The
   new-lines count is [transcript-view](../transcript-view/SPEC.md)'s S-8.
4. Late text that lands inside a selection becomes part of it (S-8): the
   user selected a stretch of the call, and that text belongs to it.

## Observer

The user: the owner, or an agent running the app, selecting in the panel.

## Behaviour

```gherkin
Feature: The user's selection holds while the call goes on

  Scenario: S-1 Selecting and copying during a call
    Given a recording with text in the panel
    When the user selects words and copies them
    Then the user can paste those words elsewhere

  Scenario: S-2 New text below the selection
    Given the user has selected words during a recording
    When new text arrives below the selection
    Then the user can still see the same words selected

  Scenario: S-3 Selected words settle in place
    Given the user has selected unconfirmed words
    When those words are confirmed unchanged
    Then the user can still see the same words selected

  Scenario: S-4 Selected words are replaced
    Given the user has selected unconfirmed words
    When the recogniser replaces them with different words
    Then the user can see the new words selected in their place

  Scenario: S-5 The selection keeps the panel still
    Given the user has selected words while looking at the last line
    When new text arrives
    Then the user can still see the selection where it was

  Scenario: S-6 Copying across both speakers
    Given the user has selected a passage spanning «я» and «они»
    When the user copies it
    Then the user can paste it with each paragraph's time and speaker

  Scenario: S-7 Late text above the selection
    Given the user has selected words during a recording
    When text marked «дописано позже» is filled in above the selection
    Then the user can still see the same words selected

  Scenario: S-8 Late text inside the selection
    Given the user has selected a passage across the point where live text began
    When the earlier minutes are filled in within it
    Then the user can copy the passage with the filled-in text in place
```
