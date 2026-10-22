---
date: 2026-10-22
model: claude-opus-5-5
description: "Live recognition — turning a recording's written audio into text as the call goes on, as the panel uses it"
---

# Live recognition — spec

## Oracle

Its clients' specs: [transcript-view](../transcript-view/SPEC.md),
[transcript-gaps](../transcript-gaps/SPEC.md),
[live-text-states](../live-text-states/SPEC.md) and
[text-banners](../text-banners/SPEC.md);
[ADR-001](../../adr-001-v1-architecture.md) decisions 4–8, invariants 11,
12, 17 and 18, and § acceptance.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. A recognition window with no answer for 30 s is stalled (S-6, S-15): three
   times transcript-view's 10 s confirm limit, so a slow window on a busy
   Mac is not taken for a stuck one. The attempt is dropped and a new one
   starts from the watermark.
2. A side whose windows fail three times running is paused (S-12, S-13):
   one failure is noise, and the banner should not flicker.

## Observer

Live recognition's clients: the live panel and its banners, which show a
recording's text. Text for audio recognised later is
[catch-up](../catch-up/SPEC.md)'s; turning words into commits
[stabilizer](../stabilizer/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client gets a recording's text as the call goes on

  Scenario: S-1 Words arrive live
    Given a recording with live text and the model ready
    When a speaker's words are written to their track
    Then the client can show them as a live tail within the latency limit

  Scenario: S-2 The live tail settles
    Given words show as a live tail
    When they can no longer change
    Then the client can show them committed in their place by time

  Scenario: S-3 Committed text is final
    Given committed text for a call
    When recognition goes on
    Then the client never gets a change to that committed text

  Scenario: S-4 A capture gap ends the stream
    Given a recording with live text
    When a track's capture is lost mid-sentence
    Then the client can show the words before the gap committed
    And the client can show a gap in that track with no text joined across it

  Scenario: S-5 Stop keeps the last words
    Given words still in a track's live tail
    When the recording stops
    Then the client can show those words committed

  Scenario: S-6 A stalled recogniser recovers
    Given a recording whose recogniser stops answering
    When it answers again
    Then the client can show the stalled time's text with no word twice and none missing

  Scenario: S-15 A dropped attempt answers late
    Given an attempt dropped as stalled and a new one running
    When the dropped attempt's replies arrive
    Then the client never gets text from them

  Scenario: S-11 Text that cannot be saved
    Given a recording with live text
    When a track's text cannot be written to the call
    Then the client can show that track's text incomplete while its live tail stays

  Scenario: S-12 Recognition of «я» keeps failing
    Given a recording with live text
    When every window of «я» fails
    Then the client can show «я» paused while «они» goes on

  Scenario: S-13 Recognition of «они» keeps failing
    Given a recording with live text
    When every window of «они» fails
    Then the client can show «они» paused while «я» goes on

  Scenario: S-14 Live text switched off mid-call
    Given a recording with live text
    When the client switches live text off
    Then the client can show the text so far and no new text
```
