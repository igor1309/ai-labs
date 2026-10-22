---
date: 2026-10-22
model: claude-opus-5-5
description: "Catch-up — when a call's unrecognised audio gets recognised after the fact, as a call's screen and the calls list use it"
---

# Catch-up — spec

## Oracle

Its clients' specs: [call-screen](../call-screen/SPEC.md),
[calls-list](../calls-list/SPEC.md), [call-delete](../call-delete/SPEC.md)
and [quit](../quit/SPEC.md); [ADR-001](../../adr-001-v1-architecture.md)
decisions 2, 4 and 11, invariants 15 and 17.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Catch-up recognises the oldest unrecognised range first (S-2): text then
   fills in from the top of the call's screen, where the reader starts.
2. Which audio counts as unrecognised is [late-text](../late-text/SPEC.md)'s
   Decided 1. "Complete" below means every unrecognised range has text;
   ranges recorded with live text off stay only recorded.
3. A quit stops catch-up like a recording does, and the next launch resumes
   it from the watermark (S-10), as quit's Decided 3 expects.

## Observer

Catch-up's clients: a call's screen, the calls list and quit, which show
whether a call's text is complete. Which minutes get text later, and their
marks, are [late-text](../late-text/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client gets a call's text completed after the fact

  Scenario: S-1 Catch-up after the call
    Given a stopped call with unrecognised audio
    When nothing else holds the activity gate
    Then the client can show the call's text complete

  Scenario: S-2 Oldest audio first
    Given a stopped call with two unrecognised ranges
    When catch-up runs
    Then the client can show the earlier range's text before the later one's

  Scenario: S-3 A recording interrupts catch-up
    Given a stopped call in catch-up
    When a recording starts
    Then the client can show the call still catching up, its unrecognised audio kept

  Scenario: S-4 Catch-up resumes after the recording
    Given catch-up yielded to a recording
    When the recording stops
    Then the client can show the earlier call's text complete

  Scenario: S-5 Catch-up resumes after a folder move
    Given catch-up yielded to a folder move
    When the move completes
    Then the client can show the call's text complete in the new folder

  Scenario: S-6 Deleting a call in catch-up
    Given a stopped call in catch-up
    When the call is deleted
    Then the client can show no catch-up left for it

  Scenario: S-7 Catch-up after a crash
    Given a call whose audio was not all recognised when the app died
    When the app launches
    Then the client can show the call's text completing with no word twice and none missing

  Scenario: S-8 A cancelled attempt answers late
    Given catch-up was cancelled while a window was being recognised
    When that window's reply arrives
    Then the client never gets text from it

  Scenario: S-9 Text that cannot be saved
    Given a stopped call in catch-up
    When its text cannot be written to the call
    Then the client can show the text incomplete, its audio kept for a later try

  Scenario: S-10 Quitting during catch-up
    Given a stopped call in catch-up
    When the app quits and launches again
    Then the client can show the call's text completing with no word twice and none missing

  Scenario: S-11 A gap in catch-up
    Given a stopped call whose unrecognised audio holds a capture gap
    When catch-up runs
    Then the client can show the text on each side of the gap with no sentence across it
```
