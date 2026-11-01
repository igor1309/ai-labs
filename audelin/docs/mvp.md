# MVP draft

Status: the product vision, true when it was written. It is not an
oracle: no spec, detail or technical choice rests on it (owner,
2026-10-23), and neither is a ruling recorded only here. The specs under
`spec/` and the owner's later rulings decide.

## Shape

One native macOS app (Swift, AppKit/SwiftUI), no server. Audio capture needs
a native binary for the system-audio permission anyway, and a browser tab
cannot float over the Zoom window. A local server can come later if the
transcript should reach a phone.

Not a fork of Amanu: its live engine is the part we would replace. Audelin
replaces Amanu rather than running next to it (owner, 2026-10-21): one app
records every call, with or without live text.
Timur Khakhalev's OpenWhispr rework took ~35 PRs plus CI and test cleanup
([chat](research/chat-khakhalev-2026-10-21.md) § 1), which is the cost a fork brings.
Amanu (MIT) and FluidAudio (Apache-2.0) are references we may copy from.
MacParakeet code is GPL-3.0 and is not copied.

## Technical rules

Taken from the spike ([tests.md](research/tests.md) run 3) and from the chat survey
([chat-khakhalev-2026-10-21.md](research/chat-khakhalev-2026-10-21.md) § 3–4).

1. **Record first.** Mic and call audio go to disk as two separate tracks, in
   short pieces, whatever recognition does. Live text hears the same audio
   as it comes, and recognition failing or lagging never costs the call; a
   crash, a network switch or an ASR stall does not lose it (owner,
   2026-10-22: live text need not read the files). Granola lost the other
   side after a Wi-Fi/VPN switch and kept no audio to redo it.
2. **Two tracks give speakers for free:** mic is «я», call audio is «они».
   Splitting the remote side into people comes later.
3. **Only convert to mono 16 kHz PCM before ASR.** No gain, compression or
   noise reduction (the chat agreed this hurts recognition).
4. **Live engine: Parakeet v3** through FluidAudio's sliding window, no
   language hint. Our own layer keeps unconfirmed text and replaces it in
   place when confirmed text arrives; FluidAudio does not do this. It also merges words repeated at chunk
   edges (tests.md run 3b).
5. **Never overwrite recognised text.** Live text is kept in an append-only
   log of settled segments; `raw.md` is rebuilt from it in time order. Later
   passes write new files next to it: raw → fixed → summary.
6. **LLM work goes to bb** (`bb thread spawn`), as Gristmill does. No API
   keys or subscriptions in the app.

## Versions

| Version | Scope | Done when |
|---|---|---|
| v0 spike | CLI over recordings; window sizes | Done ([tests.md](research/tests.md) run 3) |
| v1 live transcript | Two-track capture to disk; Parakeet v3 live; floating panel that stays on top; text settles in place and stays selectable; recording starts when a call starts and stops when it ends, or by hand; live text can be switched off; call folders named and renamed in the app | Owner runs a real call and reads along |
| v2 explain | ⌃⌥⌘E on a selection → new bb thread with the prompt from [needs.md](research/needs.md) | Explanation for RACI/OKR/SLA arrives during a call |
| v3 after the call | Final pass over the full tracks (VAD, better model) into a Markdown transcript; import an audio file through the final pass; summary through bb; call title from the calendar event | Transcript file and summary without manual steps |
| Later | Auto-detected term chips under the live text; CLI/skill so agents read transcripts; names for remote speakers (Zoom Accessibility, as Gristmill does); redo a call with another model; quotes with times for action items | Each by request |

Assumption for v1: calls are taken on headphones, so no echo cancellation.

Chunk size: 4 s by default (owner, 2026-10-21). It is a setting in debug
builds so other sizes can be tried on real calls; release builds use the
default.

Recording files (owner, 2026-10-21): each track is written in files of 30 s,
then a new file starts. The owner had no intuition for the value; it is the
most audio a damaged file can lose, not a latency setting.

Code structure (owner, 2026-10-21): one app for v1, but highly modular,
following the owner's iFora `swift-vortex` package: small targets, each
feature split into Core, adapters and UI, each with tests.

Audio after a call (owner, 2026-10-21): kept as one compact stereo file (mic
left, call right; Amanu's format, ~55 MB per hour) and deleted automatically
after 7 days. The transcript is never deleted with it. A pinned call keeps
its audio until unpinned. Audio is removed only after the transcript is
written and checked: Amanu's audit found it deleting the only copy after a
failed recognition.

Data folder (owner, 2026-10-21): app-internal files in `~/.audelin`;
calls in a visible, changeable folder (see Storage and bb output below).
Works because the app is not sandboxed (no App Store build).

Final-pass engine (owner, 2026-10-21): not fixed in code. It is a required
setting with no built-in default, and the app does not start without it: the
first launch opens setup and nothing else works until an engine is chosen. If
the chosen engine's model is missing later, the app says so at launch, not
after a call. This gate arrives with the final pass in v3; v1 setup asks only
for the calls folder and the live model (2026-10-21). Candidates are Parakeet v3 over the whole file and Whisper Large v3 Turbo
(already on this Mac). An engine-comparison test over the same recordings
backs the choice.

Screen decisions (owner, 2026-10-21, after the design review):

- Models are a hard block (owner, 2026-10-22): nothing records until every
  model the app needs is on disk. A model still downloading blocks like a
  missing one.
- Models load into memory at launch, not when a call starts (owner,
  2026-10-22). The first launch after an install or update compiles them:
  16 s for Nemotron and 17 s for Parakeet's encoder on an M3 Max; later
  loads take under a second (research run 9). Recording never waits for a
  load: the call's audio from its start is kept, the panel says live text is
  getting ready, and live text catches up once the models are in. Both
  models hear audio at about 4% of real time (run 8), so 30 s of backlog
  clears in about a second.
- Delete in the calls list removes the whole call (audio, transcript, summary
  link) after a confirm.
- Models are reused from other apps to save space, but only on an exact
  match: the same file the engine expects (name, size and checksum), not just
  the same model name. On this Mac two different files are both
  "Whisper Large v3 Turbo": Superwhisper's `ggml-large-v3-turbo.bin` and
  Amanu's quantized `ggml-large-v3-turbo-q5_0.bin`. Without an exact match the app downloads its
  own copy. A reused file that disappears is caught by the launch check.
- Auto-detected term chips under the live text go to Later.

Controls (owner, 2026-10-21), following Amanu's two checkboxes:

- «Записывать звонки автоматически»: when on, recording starts when a
  call starts and stops when it ends. A recording started by hand during
  a call stops when that call ends, because Audelin may not have been
  running when the call started; one started with no call on runs until
  stopped (owner, 2026-10-22, correcting "a recording started by hand is
  stopped by hand").
  This is v1, not v3.
- «Живой текст»: when off, the call is only recorded; its text comes from
  the final pass (v3). Switching it on mid-call starts live text and fills
  the minutes already recorded from the audio on disk, marked «дописано
  позже». Switching it off mid-call
  keeps the text so far.
- Both are checkmark items in the menu bar menu and rows in Settings. The
  menu also opens the calls folder in Finder.
- Both are on by default. A call is detected when Zoom, Telemost or a
  browser starts using the microphone, and ends 30 s after it stops. A
  recording that stops on its own keeps the panel's text.
- Not in v1: Amanu's Pause and Import… Import (a file through the final
  pass) is in v3.

Call folders (owner, 2026-10-21), following Amanu:

- One folder per call, `yyyy.MM.dd-HHmm <title>`. The timestamp stays in
  front so folders sort by time. The folder name is the title.
  A taken name gets a number after the timestamp (`yyyy.MM.dd-HHmm-2 Zoom`),
  `/` and `:` become `-`, and a call with no app is the bare timestamp (LAB-636).
- The title starts as the call app's name ("Zoom"); from v3 it is the
  calendar event's name when one overlaps the call (Calendar is an optional
  permission in setup).
- The title is editable in the calls list and the call screen; editing it
  renames the folder and keeps the timestamp. Renaming in Finder works too:
  the app identifies a call by the id in `meta.json`, never by its path.
- Files: `meta.json` (id, start, duration, app, audio status, pinned, bb
  summary thread), `audio.m4a` (mic left, call right), `live.jsonl` (append-only
  log of settled live segments), `raw.md` (rebuilt from it in time order),
  `final.md` (final pass), `summary.md`.
- Changing the data folder moves every call to the new place after a confirm
  ("Move 52 calls (135 MB)?"). There is no option to leave calls behind.

Edge cases (owner, 2026-10-21, accepted as proposed):

- No recording starts while calls are being moved, and a move does not start
  during a recording.
- Calls move one by one (copy, check, delete the source). A failed move
  leaves the remaining calls where they were and offers Retry.
- Two calls with the same title in the same minute: the second gets « 2».
- A Finder rename that drops the timestamp is accepted; the date comes from
  `meta.json`.

Storage and bb output (owner, 2026-10-21):

- Call folders live in a visible folder (default `~/Recordings/Audelin`,
  changeable), so they can be renamed in Finder. Settings, logs and other
  app-internal files stay in `~/.audelin`.
- The app writes `summary.md` itself. It starts a bb thread
  (`bb thread spawn --json`), waits for it (`bb thread wait <id>`), reads the
  answer (`bb thread output <id> --json`) and saves it in the call folder;
  `meta.json` keeps the thread id for follow-up questions. The agent never
  writes into the call folder. The ⌃⌥⌘E explanation comes back to the panel
  the same way.

v4 screen details (decided by the agents, owner delegated, 2026-10-21):

- The summary sits above the transcript, collapsed to a few lines with
  "show more".
- A failed move says how many calls moved, which one failed and why, and
  offers Retry: "Moved 31 of 52. 'Zoom 2' failed: disk full."
- After a failed move the folder setting still shows the old folder, with a
  note that some calls are there. It changes only when every call has moved.

## Name

Audelin (owner, 2026-10-21): CLI `audelin`, data in `~/.audelin`, calls in
`~/Recordings/Audelin`. In Russian it is Одели́н, stressed on the last
syllable (owner, 2026-10-21). The Russian UI uses Latin "Audelin" too. See
[audelin-naming-brief.md](audelin-naming-brief.md).
