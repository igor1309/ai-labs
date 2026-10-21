# MVP draft

Status: draft, not decided. An ADR follows once v1's open questions are
answered.

## Shape

One native macOS app (Swift, AppKit/SwiftUI), no server. Audio capture needs
a native binary for the system-audio permission anyway, and a browser tab
cannot float over the Zoom window. A local server can come later if the
transcript should reach a phone.

Not a fork of Amanu: its live engine is the part we would replace, and the
rest (call detection, crash recovery, summaries) is not what we need first.
Timur Khakhalev's OpenWhispr rework took ~35 PRs plus CI and test cleanup
([chat](chat-khakhalev-2026-10-21.md) § 1), which is the cost a fork brings.
Amanu (MIT) and FluidAudio (Apache-2.0) are references we may copy from.
MacParakeet code is GPL-3.0 and is not copied.

## Technical rules

Taken from the spike ([tests.md](tests.md) run 3) and from the chat survey
([chat-khakhalev-2026-10-21.md](chat-khakhalev-2026-10-21.md) § 3–4).

1. **Record first.** Mic and call audio go to disk as two separate tracks, in
   short pieces, before anything reads them. The live text is a view over
   that audio, so a crash, a network switch or an ASR stall does not lose the
   call. Granola lost the other side after a Wi-Fi/VPN switch and kept no
   audio to redo it.
2. **Two tracks give speakers for free:** mic is «я», call audio is «они».
   Splitting the remote side into people comes later.
3. **Only convert to mono 16 kHz PCM before ASR.** No gain, compression or
   noise reduction (the chat agreed this hurts recognition).
4. **Live engine: Parakeet v3** through FluidAudio's sliding window, no
   language hint. Our own layer keeps unconfirmed text and replaces it in
   place when confirmed text arrives; FluidAudio does not do this. It also merges words repeated at chunk
   edges (tests.md run 3b).
5. **Never overwrite raw text.** Later passes write new files next to it:
   raw → fixed → summary.
6. **LLM work goes to bb** (`bb thread spawn`), as Gristmill does. No API
   keys or subscriptions in the app.

## Versions

| Version | Scope | Done when |
|---|---|---|
| v0 spike | CLI over recordings; window sizes | Done ([tests.md](tests.md) run 3) |
| v1 live transcript | Two-track capture to disk; Parakeet v3 live; floating panel that stays on top; text settles in place and stays selectable; manual start/stop | Owner runs a real call and reads along |
| v2 explain | ⌃⌥⌘E on a selection → new bb thread with the prompt from [needs.md](needs.md) | Explanation for RACI/OKR/SLA arrives during a call |
| v3 after the call | Stop when the call ends; final pass over the full tracks (VAD, better model) into a Markdown transcript; summary through bb | Transcript file and summary without manual steps |
| Later | CLI/skill so agents read transcripts; names for remote speakers (Zoom Accessibility, as Gristmill does); redo a call with another model; quotes with times for action items | Each by request |

Assumption for v1: calls are taken on headphones, so no echo cancellation.

Chunk size: 4 s by default (owner, 2026-10-21). It is a setting in debug
builds so other sizes can be tried on real calls; release builds use the
default.

Audio after a call (owner, 2026-10-21): kept as one compact stereo file (mic
left, call right; Amanu's format, ~55 MB per hour) and deleted automatically
after 7 days. The transcript is never deleted with it. A pinned call keeps
its audio until unpinned. Audio is removed only after the transcript is
written and checked: Amanu's audit found it deleting the only copy after a
failed recognition.

## Open questions for the owner

- **Where audio and transcripts live** on disk.
- **Final-pass engine for v3:** Parakeet v3 over the whole file, or Whisper
  Large v3 Turbo already on this Mac. Needs a side-by-side on one call.
