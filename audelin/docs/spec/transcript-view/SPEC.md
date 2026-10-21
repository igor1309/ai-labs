---
date: 2026-10-22
model: claude-opus-5-5
description: "Transcript view — how the user reads a call in the live panel as it is spoken"
---

# Transcript view — spec

## Oracle

[The user spec](../SPEC.md), the client; Screens 3 and 8 in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Versions,
§ Controls and § v4 screen details; [ADR-001](../../adr-001-v1-architecture.md) § acceptance.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A word shows unconfirmed within 3 s of its end and confirmed within 10 s
   (S-3): the live windows' cadence allows it; LAB-408 measures it.
2. The panel follows new text only while its last line is in view (S-7,
   S-8): scrolled up, it stays where the user put it.
3. Scrolled up, the panel counts the new lines and jumps to them on a click
   (S-8), as Screen 3's «2 новые ↓» pill draws for a selection.

## Observer

The user: the owner, or an agent running the app, reading the live panel.
A selection is [selection](../selection/SPEC.md)'s, the last words before
Стоп [live-panel](../live-panel/SPEC.md)'s S-7, and the banner for a lost
side [error-banners](../error-banners/SPEC.md)' S-6 and S-7, and gaps
[transcript-gaps](../transcript-gaps/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user reads both sides of a call while it goes on

  Scenario: S-1 The owner's words
    Given a recording with live text
    When the owner speaks
    Then the user can read the owner's paragraph under its time and «я»

  Scenario: S-2 The other side's words
    Given a recording with live text
    When the other side speaks
    Then the user can read their paragraph under its time and «они»

  Scenario: S-3 Words appear while the call goes on
    Given a recording with live text and recognition keeping up
    When a speaker finishes a word
    Then the user can read the word unconfirmed soon after and confirmed a little later

  Scenario: S-4 Unconfirmed text settles in place
    Given unconfirmed words show dim at the end of a paragraph
    When they are confirmed with a different spelling
    Then the user can read the confirmed words in the same place with no sideways jump

  Scenario: S-5 Words at a window edge show once
    Given the owner says a phrase across the edge of two recognition windows
    When both windows have been read
    Then the user can read each spoken word once

  Scenario: S-6 Late text lands in its place
    Given live text started after the call had begun
    When the minutes already recorded are filled in
    Then the user can read them above the live text in time order, marked «дописано позже»

  Scenario: S-7 The panel follows the end
    Given the user is looking at the last line
    When new text arrives
    Then the user can read the new text without scrolling

  Scenario: S-8 The panel stays where the user scrolled
    Given the user has scrolled up to earlier text
    When new text arrives
    Then the user can keep reading the earlier text and jump to the new lines by their count

  Scenario: S-14 Confirmed words never change
    Given confirmed words in the panel
    When recognition goes on
    Then the user can read the confirmed words unchanged

  Scenario: S-12 Both sides in time order
    Given a recording with live text
    When the owner and the other side take turns
    Then the user can read their paragraphs in the order they were spoken
```
