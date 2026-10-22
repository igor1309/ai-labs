---
date: 2026-10-22
model: claude-opus-5-5
description: "FluidAudio ASR — Parakeet v3 recognising a window of recorded audio, as live recognition's port"
---

# FluidAudio ASR — spec

## Oracle

Its clients' specs: [live-recognition](../live-recognition/SPEC.md),
[catch-up](../catch-up/SPEC.md) and [stabilizer](../stabilizer/SPEC.md); the
user spec's S-7; [ADR-001](../../adr-001-v1-architecture.md) decisions 6, 7
and 10, invariant 14.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. It recognises whole windows Audelin cuts, not FluidAudio's sliding stream
   (S-1), as ADR-001 decision 7 (amended 2026-10-21) sets.
2. Word times are in the call's clock, not the window's (S-1), so the
   stabilizer can place words across windows.

## Observer

The recogniser port's clients: live recognition and catch-up, which send
windows of recorded audio and pass the words to the stabilizer.

## Behaviour

```gherkin
Feature: A client gets words from a window of audio

  Scenario: S-1 Words with times
    Given the live model is ready
    When the client sends a window of speech
    Then the client can get its words, each with its start and end in the call's clock

  Scenario: S-2 English terms in Russian speech
    Given the live model is ready
    When the client sends a Russian sentence with English terms
    Then the client can get those terms in Latin letters

  Scenario: S-3 Silence
    Given the live model is ready
    When the client sends a window of silence
    Then the client can get no words

  Scenario: S-4 No model
    Given the live model is not on this Mac
    When the client sends a window
    Then the client can learn that the model is not ready

  Scenario: S-5 Two tracks at once
    Given the live model is ready
    When the client sends a window of each track together
    Then the client can get each track's words apart

  Scenario: S-6 A failed window
    Given the live model is ready
    When recognition of a window fails
    Then the client can learn that the window failed, apart from silence
```
