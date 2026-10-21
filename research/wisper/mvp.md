# MVP draft

Status: draft, not decided. An ADR follows once the spike below passes.

## Shape

One native macOS app (Swift, AppKit/SwiftUI), no server. Audio capture needs
a native binary for the system-audio permission anyway, and a browser tab
cannot float over the Zoom window. A local server can come later if the
transcript should reach a phone.

Not a fork of Amanu: its live engine is the part we would replace, and the
rest (call detection, crash recovery, summaries) is not what we need first.
Amanu (MIT) and FluidAudio (Apache-2.0) are references we may copy from.
MacParakeet code is GPL-3.0 and is not copied.

## Parts

| Part | Size | Source |
|---|---|---|
| Capture mic + call audio as two tracks | ~300 lines | Core Audio process tap (macOS 14.2+) or ScreenCaptureKit |
| Recognition | small | FluidAudio `SlidingWindowAsrManager`, Parakeet v3 |
| Smoothing: partial text that settles, steady append | main work | ours |
| Floating `NSPanel`, selectable text that survives appends | medium | ours |
| Start/stop | button | call detection later |

Assumption for v1: calls are taken on headphones, so no echo cancellation.

## Step 0 — spike before any UI

A CLI runs the existing test recordings (`~/superwhisper/recordings/*/output.ogg`)
through `SlidingWindowAsrManager` at several window and overlap sizes and
reports text and delay per setting. Window sizes are to be chosen with the
owner; FluidAudio's default is ~15 s with 2 s overlap.

Pass: the abbreviations are recognisable and the delay is acceptable to the
owner. Fail: reconsider the engine before building UI.

## Later

- Hotkey ⌃⌥⌘E on a selection → `bb thread spawn --prompt-file -` with the
  explanation prompt from [needs.md](needs.md).
- Call detection and auto stop.
- Final pass over the full recording; summary via bb.
