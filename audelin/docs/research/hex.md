# Hex compared with Audelin (2026-11-27)

[anomalyco/hex](https://github.com/anomalyco/hex): MIT, Rust, about 8.9k
stars, by the OpenCode team. Read from its README, AGENTS.md, ROADMAP.md and
`docs/features/meetings.md`; the app was not run.

**Short version:** different products. Hex is cross-platform local
dictation; recording calls is a macOS beta in its Labs. Audelin is a native
macOS call companion built around Russian speech with English terms. They
overlap in one place: both record a call as two tracks and transcribe it
locally.

## Product

| | Hex | Audelin |
|---|---|---|
| Main job | Dictation: hold a key, speak, text is pasted at the cursor | Calls in Zoom, Telemost, Meet: recording, live transcript, notes |
| Platforms | macOS (Apple silicon), Windows x64/ARM64, Linux x64/ARM64 (X11, Wayland); iOS in TestFlight, Android in development | macOS only |
| Stack | Rust with its own UI framework Rune; Kotlin and Swift on mobile | Swift, SwiftUI, models through FluidAudio |
| Contributions | No pull requests: users open issues, the team's agents do the work | — |

## Calls: Hex Meetings and Audelin

| | Hex Meetings (beta, macOS) | Audelin |
|---|---|---|
| How it is turned on | A Labs switch, off by default | The main feature |
| Capture | System audio and microphone, two tracks | The same |
| Start and stop | Records on its own only for calls answered "Always record"; a policy per app or website ("Slack huddles: Record automatically"); auto-stop is a switch | Records every detected call; when call audio is unavailable, retries every 5 s |
| Speakers | Only "You" and "Them" | Diarization of the far side, names from Zoom, from the Telemost browser extension, or from the conversation |
| Live text | A rolling draft; meeting transcription yields the model to dictation | A smooth, selectable transcript in a floating panel |
| Models | Parakeet with pause cuts; a large catalog (GigaAM v3 for Russian among others) and the user's own GGUF files | Parakeet and Nemotron; re-recognition of past calls |
| Echo | Echo suppression on the sample timeline | Bleed cleanup |
| Notes | Titles and short summaries through Apple Intelligence (default) or an OpenCode model | Notes from templates (Default, Daily, own), off by default; Settings shows where a transcript goes and what it costs |
| Storage | Markdown and NDJSON in `~/Documents/Hex Meetings`, deleted after 7 days by default | `~/Recordings/Audelin`, a calls window with merge, split and tags |
| Calendar | EventKit: calendar and reminders before meetings | None |
| Search | BM25 over meetings | Folder index |
| Integrations | `hex transcribe` CLI, an authenticated local API, a TypeScript SDK, MCP (`list_meetings`) | `audelin` CLI, follow client, the call-assistant skill that hints live during a call |

## Only in Audelin

- Telling speakers apart and naming them.
- An assistant that follows the call live and checks what is said against
  the project's decisions.
- Mixed Russian and English as the main case, not one model in a catalog.
- A calls window: merge, split, transcribe again, daily notes, names carried
  between calls.

## Only in Hex

- Dictation into any app, with an Output chain: replacements, the user's
  TypeScript scripts, an LLM rewrite, different steps per app.
- One Vocabulary list that the models read while recognising.
- Windows, Linux and mobile apps.
- Calendar, per-app recording rules, a retention period.
- A local API and SDK for other programs.
- Summaries on the device through Apple Intelligence.

## How it is built

- **Docs.** Hex keeps capability maps (`docs/features/*.md`): a tree of UI
  states with the tests that check them. Audelin keeps a spec per component
  and an ARCHITECTURE.md of rules only. Hex's maps describe the product from
  the screen; Audelin's specs describe it from the components.
- **Architecture.** Hex calls its modules deep and its behaviour explicit:
  one thread (`TranscriptionEngine`) owns the warm model, and shared UI is
  kept apart from per-OS code. Audelin is stricter: each component owns the
  interfaces it depends on, the outside world lives only in adapters,
  decisions over time are state machines with pure reducers, and there is no
  shared domain module.
- **Merging.** Hex merges a PR once it compiles locally, without waiting for
  CI; full test suites run in release channels, and UI changes need updated
  golden images. Audelin merges only on green CI.
- **New features.** In Hex everything new lands in Labs, off by default. In
  Audelin a feature passes gates: user spec, architecture, component specs.

## What Audelin could take

1. **GigaAM v3**, Hex's Russian model: compare it with Parakeet and Nemotron
   on Russian with English terms (see `live-engines.md`: strong on plain
   Russian, unknown whether it writes Latin letters).
2. **Recording rules per app** ("Ask each time", "Always record") and
   **auto-stop when the call ends** as a setting.
3. **Notes on the device through Apple Intelligence** as a free option that
   sends nothing out.
4. **Echo suppression on the sample timeline** and recorded arrival offsets
   of the two tracks, for bleed cleanup.
5. **An MCP server or local API** for reading calls from other programs.
