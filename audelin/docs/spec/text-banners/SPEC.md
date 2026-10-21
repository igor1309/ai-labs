---
date: 2026-10-22
model: claude-opus-5-5
description: "Text banners — what the live panel tells the user when live text fails while the call still records"
---

# Text banners — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 8 in
[the design](../../design/README.md); [ADR-001](../../adr-001-v1-architecture.md)
decision 4 (a segment that cannot be logged pauses its track).

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. When recognition of one side keeps failing, a banner says live text is
   paused for that side (S-1, S-2): a silent stop reads as a quiet speaker.
2. When the text cannot be saved, recording goes on and a banner says the
   text is incomplete (S-3): the audio is the record, the text can follow.

## Observer

The user: the owner, or an agent running the app, looking at the panel.
Banners about capture and the disk are
[error-banners](../error-banners/SPEC.md)'s.

## Behaviour

```gherkin
Feature: The user learns that live text failed while the call still records

  Scenario: S-1 Live text paused for «они»
    Given a recording with live text
    When recognition of «они» keeps failing
    Then the user can see that live text is paused for «они» while «я» goes on

  Scenario: S-2 Live text paused for «я»
    Given a recording with live text
    When recognition of «я» keeps failing
    Then the user can see that live text is paused for «я» while «они» goes on

  Scenario: S-3 The text cannot be saved
    Given a recording with live text
    When the call's text can no longer be saved to its folder
    Then the user can see that the recording goes on and its text is incomplete
```
