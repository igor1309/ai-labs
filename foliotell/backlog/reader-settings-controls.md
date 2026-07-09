---
date: 2026-07-09
model: gpt-5
description: "Backlog item for separating FolioTell reader settings from playback controls."
---

# Reader Settings and Playback Controls

## Purpose

Separate infrequent reader configuration from the compact playback surface so
the controls used during listening stay quick to reach and future neural voice
management has a clear home.

## Scope

- Add a gear button in the top trailing navigation bar that opens a reader
  settings page.
- Move the front-matter Read/Skip choice to that settings page.
- Keep a leading bottom-bar Voice control for choosing an already available
  voice. Call it "Voice", not "Models", until neural voices actually exist.
- Reduce the trailing bottom-bar menu to Speed and Start Over.

## Boundaries

- Reserve the settings page as the home for neural-model browsing, download,
  deletion, and storage visibility **after** the on-device neural-TTS device
  spike passes.
- This item must not add a model download flow or change the offline/network
  promise.
- Keep Apple voice-quality onboarding's deep link directed at iOS Settings:
  Apple voice downloads remain system-managed and are distinct from future
  FolioTell-managed neural models.
