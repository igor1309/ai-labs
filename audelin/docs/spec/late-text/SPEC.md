---
date: 2026-10-22
model: claude-opus-5-5
description: "Late text — which minutes of a call get text after they were spoken, and how they are marked"
---

# Late text — spec

## Oracle

Its clients' specs: [live-text-states](../live-text-states/SPEC.md),
[transcript-view](../transcript-view/SPEC.md) S-6 and
[call-screen](../call-screen/SPEC.md) S-7, S-9, S-12; [mvp.md](../../mvp.md)
§ Controls, § Edge cases and § v4 screen details.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Audio recorded while live text was on, but not recognised live, is
   unrecognised and gets text later (S-1, S-5). Audio recorded while live
   text was off gets text later only if live text is switched on again in
   the same call (S-2); otherwise it stays only recorded (S-3, S-4), since
   mvp.md gives it text from the v3 final pass.

## Observer

The clients that show a call's text: the live panel and a call's screen.
When that text is recognised is [catch-up](../catch-up/SPEC.md)'s.

## Behaviour

```gherkin
Feature: A client shows which minutes got their text later

  Scenario: S-1 The model arrives late
    Given a recording with live text on that started before the live model was ready
    When the model becomes ready
    Then the client can show the minutes before it, marked added later

  Scenario: S-2 Live text switched on mid-call
    Given a recording with live text off and the model ready
    When the client switches live text on
    Then the client can show the minutes before it, marked added later

  Scenario: S-3 Live text off throughout
    Given a stopped call recorded with live text off throughout
    When nothing else holds the activity gate
    Then the client can show the call as only recorded

  Scenario: S-4 Live text switched off partway
    Given a stopped call whose live text was switched off partway and not on again
    When nothing else holds the activity gate
    Then the client can show the text up to the switch and the rest as only recorded

  Scenario: S-5 Text the live pass missed
    Given a stopped call with live text on throughout, whose live text fell behind
    When its catch-up completes
    Then the client can show the call's text complete with no minutes marked only recorded

  Scenario: S-6 Marks survive a relaunch
    Given a call with minutes added later
    When the app launches again
    Then the client can show those minutes marked added later
```
