---
date: 2026-10-22
model: claude-opus-5-5
description: "Transcript — building a call's readable text from its committed segments, gaps and marks"
---

# Transcript — spec

## Oracle

Its clients' specs: [live-recognition](../live-recognition/SPEC.md),
[calls-catalogue](../calls-catalogue/SPEC.md) S-10,
[transcript-view](../transcript-view/SPEC.md) and
[transcript-gaps](../transcript-gaps/SPEC.md);
[ADR-001](../../adr-001-v1-architecture.md) decisions 5, 8 and 9.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A paragraph breaks where the speaker changes or a gap falls (S-2, S-4),
   and nowhere else: it needs no pause threshold, and a turn is how the
   user reads a call.
2. The panel and the call's text are built by the same function from the
   same segments (S-7), so they cannot drift apart.
3. The live tail is placed by its time among the committed text, so the
   call reads in time order, and is replaced, not appended to, when its
   words commit (S-8, S-9), as ADR-001 decision 8 sets.

## Observer

The transcript's clients: live recognition, which patches the panel, and
the calls catalogue, which gives a call's screen its text.

## Behaviour

```gherkin
Feature: A client builds a call's text from its segments

  Scenario: S-1 Both sides in time order
    Given segments of both sides
    When the client builds the text
    Then the client can get paragraphs in the order they were spoken
    And the client can get each paragraph's start time and side

  Scenario: S-2 One speaker, one paragraph
    Given consecutive segments of one side
    When the client builds the text
    Then the client can get them in one paragraph

  Scenario: S-3 A late segment lands in its place
    Given text built from segments
    When an earlier segment arrives late
    Then the client can get it in its place by time

  Scenario: S-4 A gap
    Given a gap in one side
    When the client builds the text
    Then the client can get a gap line naming the side and its start time, with no paragraph across it

  Scenario: S-5 Marks
    Given segments added later, text marked incomplete and minutes only recorded
    When the client builds the text
    Then the client can get each mark with the text it covers
    And the client can get the minutes that are only recorded

  Scenario: S-6 A patch per change
    Given text built from segments
    When a segment is added
    Then the client can get a patch that turns the old text into the new

  Scenario: S-7 The same segments, the same text
    Given a call's segment log
    When the text is built for the panel and for the call's screen
    Then the client can get the same text both times

  Scenario: S-8 The live tail
    Given text built from segments
    When the client sets a live tail
    Then the client can get a patch that shows the tail in its place by time

  Scenario: S-9 A committed tail
    Given text with a live tail
    When the tail's words arrive as a segment
    Then the client can get a patch that shows them once, as committed text
```
