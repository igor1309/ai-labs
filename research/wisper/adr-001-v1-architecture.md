---
date: 2026-10-21
model: claude-opus-5-5
description: "wisper v1 is one modular macOS app: record first, live ASR per track, ports and adapters"
---

# ADR-001 — One modular app for v1

## Executive summary

wisper v1 (scope in [mvp.md](mvp.md) § Versions) is one native macOS app.
It records the mic and the call audio to disk first, runs one live Parakeet
v3 stream per track over what was recorded, and turns the updates into text
that settles in place in a floating panel. The code is one local Swift
package of small targets: pure domain logic, features split into Core and
UI, and adapters for everything external. Only the app target wires them
together. Agents, CLI and the final pass come later behind the same ports.

## Context

The owner needs a smooth, selectable live transcript of Russian calls with
English terms ([needs.md](needs.md)). What shaped the decision:

- The spike ([tests.md](tests.md) runs 3–3b): FluidAudio's sliding window
  updates once per 4 s chunk, covers only the newest chunk when unconfirmed,
  and repeats words at chunk edges. Smoothing has to be our own logic.
- Two live streams at once cost about 3 s of CPU and 30 MB more and no wall
  time; each runs ~70× real time (tests.md run 4).
- The chat survey ([chat-khakhalev-2026-10-21.md](chat-khakhalev-2026-10-21.md)):
  apps lost calls by recognising before recording.
- MacParakeet's window fell behind others and lost selection (tests.md run 2).
- The owner's Swift projects split one package into small Core, Adapters and
  UI targets per feature (iFora `swift-vortex`).

| Alternative | Why not |
|---|---|
| Background recorder plus a UI app, as Verger's service | Capture permissions belong to the app bundle; the CLI is a Later item. The session boundary below keeps the split possible. |
| Fork Amanu | Its live engine is what we would replace ([mvp.md](mvp.md) § Shape). |
| Live ASR straight from the mic | A crash or stall loses audio; record first instead. |
| One mixed ASR stream | Loses «я»/«они» for free; two streams are cheap (run 4). |
| SwiftUI text view for the transcript | Selection while text appends is the main requirement; `NSTextView` gives control over it. |

## Decision

1. **One app, one authority.** The app process owns each recording session.
   UI shows session state and never keeps its own copy of the transcript.
2. **Record first.** Capture → Recorder → disk, as two tracks in 30 s pieces
   (owner, 2026-10-21). Live ASR reads what the Recorder passed on and can
   resume from disk after a restart.
3. **One live stream per track:** mic is «я», call audio is «они». Each has
   its own stabilizer; the transcript merges them by time.
4. **The stabilizer is pure logic.** It keeps unconfirmed text, replaces it
   in place when confirmed text arrives, and merges words repeated at chunk
   edges.
5. **Ports and adapters.** Capture, ASR engine, call store, settings, model
   store and clock are ports declared by the Core that needs them. Only the
   composition root in the app target creates adapters.
6. **Native panel.** An `NSPanel` that stays on top and an `NSTextView`.

Module layout (one local Swift package plus a thin app target):

```text
App target    entry point + composition root
Domain        CallDomain (call, meta.json, folder and title rules)
              TranscriptCore (stabilizer, edge merge, track merge)
Features      LiveSessionCore / LiveSessionUI
              CallsCore / CallsUI
              SetupCore / SetupUI
Adapters      AudioCapture · Recorder · FluidAudioASR
              FileCallStore · SettingsStore · ModelStore
```

## Rules / invariants

1. Domain and Core targets MUST import Foundation only, not AVFoundation,
   CoreAudio, AppKit or FluidAudio.
2. A Core target MUST declare the ports it needs; adapters implement them.
3. Adapters MUST NOT import other adapters.
4. UI targets MUST depend only on their own Core and Domain.
5. Only the app target MAY import every module or create an adapter.
6. Every target MUST have a test target. TranscriptCore MUST be tested
   against the spike's recorded updates, without audio or a model.
7. Live ASR MUST NOT read from capture directly; audio reaches it only
   through the Recorder.
8. `raw.md` MUST be append-only. Only the FileCallStore adapter MAY write to
   a call folder, and it MUST find a call by the id in `meta.json`, never by
   path.
9. The UI MUST NOT hold transcript state that is not in the session.

## Consequences

- Each piece is testable alone; the hard part, the stabilizer, is tested
  with recorded data in milliseconds.
- A final-pass engine (v3) is a second adapter behind the ASR port; a CLI or
  agent surface (Later) is a second client of the session boundary.
- More targets and protocols than a single-target app; accepted for the
  owner's modularity requirement.
- The first build must measure what run 4 did not: text delay at real-time
  pace, and selection while text appends (tests.md § Not yet measured).

## Non-goals

- A background service, CLI or agent access in v1.
- The final pass, summaries, bb explanations and calendar titles (v2–v3).
- How system audio is captured (Core Audio tap or ScreenCaptureKit), the
  piece file format, and the concurrency model. These belong to the spec.
- Echo cancellation: v1 assumes headphones.
