---
date: 2026-10-22
model: claude-opus-5-5
description: "Segment log — the append-only record of a call's committed segments, watermarks, gaps and marks"
---

# Segment log — spec

## Oracle

Its clients' specs: [live-recognition](../live-recognition/SPEC.md),
[catch-up](../catch-up/SPEC.md), [late-text](../late-text/SPEC.md) and
[calls-catalogue](../calls-catalogue/SPEC.md); [mvp.md](../../mvp.md) § Call
folders (`live.jsonl`); [ADR-001](../../adr-001-v1-architecture.md)
decisions 4 and 8.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A half-written last entry, as a crash leaves it, is skipped on reading
   and never repaired in place (S-3): the log stays append-only, and the
   entry's words are re-recognised from the watermark.

## Observer

The log's clients: the cores that commit text and the catalogue that reads
it back.

## Behaviour

```gherkin
Feature: A client appends a call's segments and reads them back

  Scenario: S-1 Segments read back in order
    Given a call's log
    When the client appends segments
    Then the client can read them back in the order appended

  Scenario: S-2 The log outlives the app
    Given a call's log with segments
    When the app launches again
    Then the client can read every segment back

  Scenario: S-3 A torn last entry
    Given a log whose last entry was cut short by a crash
    When the client reads the log
    Then the client can get every whole entry and no torn one

  Scenario: S-4 Watermarks
    Given segments and a watermark for each track and epoch
    When the client reads the log
    Then the client can get each watermark

  Scenario: S-5 Gaps and marks
    Given a log with a gap and segments marked added later
    When the client reads the log
    Then the client can get the gap and the marks

  Scenario: S-6 Earlier entries never change
    Given a call's log
    When the client appends more
    Then the client can find the earlier entries byte for byte as they were

  Scenario: S-7 A write that fails
    Given a call's log on a full disk
    When the client appends a segment
    Then the client can learn the append failed
    And the client can still read every earlier entry

  Scenario: S-8 A commit and its watermark together
    Given a call's log
    When the process dies while the client appends segments with their watermark
    Then the client can find no watermark read back without its segments
    And the client can find no segments read back without their watermark

  Scenario: S-9 A watermark through silence
    Given a call's log
    When the client moves a watermark past silence with no segment
    Then the client can read the moved watermark back

  Scenario: S-10 Appending after a torn entry
    Given a log whose last entry was cut short by a crash
    When the client appends segments
    Then the client can read every whole entry, then the new segments
```
