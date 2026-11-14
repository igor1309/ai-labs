# Audelin and Yogurt

[Yogurt](https://github.com/FrigadeHQ/yogurt) (Frigade, MIT) is a free,
open-source alternative to Granola: private meeting notes on Mac, Windows and
Linux, with no bot in the call. This compares it with Audelin from its README,
file layout, Mac audio helper and model catalog.

| | Audelin | Yogurt |
|---|---|---|
| Platforms | macOS, menu bar app | macOS 14.4+ (Apple silicon), Windows 10 2004+, Linux AppImage |
| Stack | Native Swift and SwiftUI, state machines | Electron and TypeScript, small native helpers per OS |
| Audio | Mic and call as two tracks | Mic (AVAudioEngine, no voice processing) and a global process tap excluding Yogurt's own processes, mixed per meeting |
| Live transcript | Floating panel, smooth and selectable, Russian with English terms | whisper.cpp, Apple SpeechAnalyzer on supported Macs; 99 languages |
| Speakers | Mic side is the owner; after the call the far side is diarized (Nemotron, VBx fallback) into `Them 1`, `Them 2`…, named from Zoom and, through the browser extension, Telemost | Named from Zoom, Teams and Meet, Mac only |
| Start and stop | Records automatically when Zoom, Telemost or a browser takes the mic, stops when the call ends | Offers to record when a supported call starts, stops when it ends |
| Notes | Optional, off by default; Claude CLI on a subscription or an API, with cost shown; durable jobs; `summary.md` beside the call | Always local: Gemma 4 or Qwen3 through llama.cpp |
| Across calls | Calls window lists calls beside the selected call's notes | Questions across meetings with source links (local embeddings), folders, search, Markdown export, local MCP server |
| Distribution | Developer ID signed, notarized weekly releases in the public `igor1309/audelin` repository; automatic updates on the owner's Mac | Signed downloads for three platforms, website |

## What Audelin could take

- **Local notes.** A small open-weight model through llama.cpp as a third
  notes destination: no cost, no credentials, no shell variables missing in a
  Finder-launched app. Its quality on Russian calls with English terms is
  unproven and needs a comparison against the current prompt.
- **Questions across calls.** Answers from past transcripts and notes with
  links to the source call and moment.
- **A local MCP server.** Read access to calls for an assistant the owner
  allows; it also suits term explanations through bb.
- **Search.** Find a call by title, notes or transcript in the calls window.

## Where Audelin differs on purpose

Two tracks instead of one mixed tap keep the owner's side apart without
diarization. The transcript is tuned for one language mix, and notes go to
a destination the owner pays for knowingly. Audelin does not aim at Windows
or Linux.

## Open

- Whether Yogurt's tap settings (drift compensation, voice processing off on
  the mic) differ from Audelin's capture in ways worth adopting; see
  [system-audio.md](system-audio.md); tracked in Multica.
