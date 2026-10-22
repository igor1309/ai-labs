---
date: 2026-10-22
model: claude-opus-5-5
description: "Stabilizer — turning each recognition window's words into committed segments and a live tail"
---

# Stabilizer — spec

## Oracle

Its clients' specs: [live-recognition](../live-recognition/SPEC.md) and
[catch-up](../catch-up/SPEC.md); [ADR-001](../../adr-001-v1-architecture.md)
decisions 4–8, invariants 11, 12, 14 and 17.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. The window cutter marks where each window's right context begins; the
   stabilizer only reads that mark (S-1, S-2), so the context length stays
   a recognition setting, not stabilizer logic.

## Observer

The stabilizer's clients: live recognition and catch-up, which feed it
windows and log what it commits. It has no audio and no model.

## Behaviour

```gherkin
Feature: A client gets committed segments and a live tail from recognition windows

  Scenario: S-1 A word with full right context commits
    Given a window whose word ends before its right context begins
    When the client feeds the window
    Then the client can get the word in a committed segment

  Scenario: S-2 A word in the right context stays live
    Given a window whose last word lies in its right context
    When the client feeds the window
    Then the client can get that word in the live tail only

  Scenario: S-3 A newer reading replaces the tail
    Given a word in the live tail
    When the next window reads it differently
    Then the client can get the tail with the newer reading

  Scenario: S-4 Overlapping windows commit a word once
    Given two windows that both read the same words
    When the client feeds both
    Then the client can get each word committed once

  Scenario: S-5 Commits keep time order
    Given earlier text still in the live tail
    When a later word could commit
    Then the client can get no commit for it until the earlier text commits

  Scenario: S-6 An epoch's end commits the final reading
    Given words in the live tail
    When the client feeds the epoch's final window
    Then the client can get that window's reading of them committed

  Scenario: S-7 No sentence across an epoch
    Given an epoch that ended mid-sentence
    When the next epoch's words arrive
    Then the client can get them in segments of their own

  Scenario: S-8 Words before the watermark are dropped
    Given a watermark after some committed words
    When a new attempt's window reads those words again for context
    Then the client can get no commit for them

  Scenario: S-9 A failed window
    Given words in the live tail
    When the client reports a window failed
    Then the client can get the tail unchanged and nothing committed

  Scenario: S-10 The watermark follows commits
    Given words committed and words in the live tail
    When the client reads the watermark
    Then the client can find it no earlier than the end of the committed words
    And the client can find it before the tail

  Scenario: S-11 Silence moves the watermark
    Given a window that holds no words, with no earlier text in the live tail
    When the client feeds the window
    Then the client can find the watermark past the silence

  Scenario: S-12 Silence after a live tail
    Given words in the live tail
    When the client feeds a later window that holds no words
    Then the client can find the watermark still before the tail

  Scenario: S-13 Committed text stays final
    Given committed words
    When a later window reads them differently
    Then the client can get the committed words unchanged
```
