---
date: 2026-07-08
model: claude-fable-5
description: "FolioTell device speech — audio session and voice resolution design, falsified hypotheses, and the on-device diagnostic procedure for silent reading"
---

# Device Speech: Design, History, and Diagnostics

Living reference for FolioTell's device speech behavior — not a spec and not
one-off research. It records three things: the current design rationale
(why the speech path is built the way it is), the hypothesis ledger (what
was tried, falsified, or confirmed per release), and the diagnostic runbook
for device-only audio symptoms. Update it whenever a device investigation
adds or invalidates knowledge. The founding symptom class: speech works in
the iOS Simulator but produces no audio on a physical iPhone, while playback
state (play/pause UI) advances normally.

## Current Design

### Voice resolution (`SpeechController` + `SpeechVoiceSelection`)

- A user-picked voice is instantiated by identifier.
- The automatic ("Auto") voice is resolved from the **installed catalog**
  (`AVSpeechSynthesisVoice.speechVoices()`) via
  `SpeechVoiceSelection.automaticVoiceIdentifier`, preferring voices with
  non-empty `audioFileSettings`, falling back to any exact language match,
  then to the system default voice (utterance voice left `nil`).
- Never trust `AVSpeechSynthesisVoice(language:)`: it can return a voice that
  instantiates but produces **no audio on device** while delegate callbacks
  still fire — the documented, Apple-unresolved "empty `audioFileSettings` /
  unable to list voice folder" bug class (Apple Developer Forums threads
  738048, 746113). This exactly matches the symptom class above.
- Language detection is deliberately minimal: Cyrillic text → `ru-RU`,
  otherwise no detection (default voice).

### Audio session (`SpeechController`)

- Category `.playback`, mode `.spokenAudio`, activated before `speak()`,
  deactivated (with `.notifyOthersOnDeactivation`) on stop/finish/cancel.
- `.playback` is load-bearing: it makes speech ignore the ring/silent switch.
- `Info.plist` declares `UIBackgroundModes: audio`.
- Apple's WWDC20 guidance (session 10022) recommends
  `usesApplicationAudioSession = false` (system-managed session) for
  speech-centric apps. Deliberately **not** adopted: it is unverified whether
  the system-managed session ignores the silent switch, and the session was
  ruled out as the silence cause (see History). Reconsider only with device
  validation in hand.

## History of Hypotheses

| Release | Hypothesis | Outcome |
|---|---|---|
| 0.0.1 | — | Silent reading on device reported (simulator fine). |
| 0.0.2 | Default app audio session is the cause; configure `.playback`/`.spokenAudio` + background audio mode (PR #709). | **Falsified** — shipped, upload confirmed, still silent on device (iPhone 15 Pro, iOS 26.5). |
| 0.0.3 | `AVSpeechSynthesisVoice(language:)` returns a non-functional voice; resolve from installed catalog instead (PR #713). | **Confirmed on device** (2026-07-08, iPhone 15 Pro, iOS 26.5) — reading is audible. |
| 0.1.1 | Stop latency (seconds of audible speech after Stop, reported on 0.0.3) is a main-thread stall symptom: per-render `speechVoices()` calls blocked the UI, delaying the stop's effects; removed by the 0.1.0 menu-freeze fix (PR #723). | **Resolved on device** (2026-07-08, iPhone 15 Pro, iOS 26.5, v0.1.1) — Stop is immediate. Probable cause, not proven: the instrumented measurement matrix was never needed; the stop-path instrumentation (PR #726) stays in place as the reopen path. |

Do not re-propose falsified fixes. The audio-session code is kept because it
is correct and mute-switch-protective, not because it fixed the silence.

## Diagnostic Procedure

`SpeechController` logs via `Logger(subsystem: "foliotell.FolioTell",
category: "speech")` at play time:

- `resolved <lang> to voice <identifier> from <n> catalog voices` — catalog
  resolution succeeded; if still silent, the voice asset itself is broken.
- `no voice matches <lang>; catalog has <n> voices; falling back to default
  voice` — no matching voice installed on the device; with Cyrillic text and
  an English default voice, output is garbled or near-silent.

To capture on device: connect the iPhone, open Console.app (or
`log stream --device`), filter subsystem `foliotell.FolioTell`, press Play in
the app. Also check Settings → Accessibility → Spoken Content → Voices for
whether a Russian voice is installed at all.

Capture gotcha: the stop/pause instrumentation logs at **info** level, which
`log stream` drops by default — pass `--level=debug` (in Console.app enable
Action → Include Info Messages), or the timeline lines never appear.

Key facts for interpretation:

- `AVSpeechSynthesisVoice.speechVoices()` can stall for **seconds** on
  device — never call it on the main thread or per render. Per-render calls
  caused the 0.1.0 settings-menu freeze and, most plausibly, the 0.0.3 stop
  latency; the cached off-main-actor query (PR #723) is verified fixed on
  device (2026-07-08, iPhone 15 Pro, iOS 26.5, v0.1.1) — menu opens
  instantly, Stop is immediate.
- The simulator ships with a much richer pre-installed voice catalog than
  devices — "works in simulator" says nothing about device voice
  availability.
- Delegate callbacks (`didStart`/`didFinish`) firing does **not** prove audio
  was produced.
- Wrong-language voice + Cyrillic text historically produces garbled speech,
  not clean silence (forum thread 692192); clean silence points at a broken
  voice asset instead.

## References

- Apple Developer Forums 738048 — "AVSpeechSynthesizer is broken on iOS 17":
  empty `audioFileSettings` voices produce silence; no Apple fix published.
- Apple Developer Forums 746113 — "Unable to List Voice Folder".
- Apple Developer Forums 692192 — device-only Russian speech corruption
  (historical, reported fixed by iOS 16).
- WWDC20 session 10022 — "Create a seamless speech experience in your apps"
  (`usesApplicationAudioSession` semantics).

## Open Questions

- Stop latency: **resolved** — see the 0.1.1 hypothesis-table row. Kept
  knowledge from the investigation (intake at
  [`intake/stop-latency-intake.md`](intake/stop-latency-intake.md)): simulator baseline
  (2026-07-08, iPhone 15 Pro sim, iOS 18.6, compact Milena) shows
  `stopSpeaking(at: .immediate)` accepted, both audio-session deactivations
  succeeding, and the full machine-side stop sequence completing in ~12 ms;
  after `stopSpeaking`, the synthesizer delivers **`didFinish`, not
  `didCancel`** on this runtime — future measurements must not assume the
  cancel callback fires. If stop latency recurs, run the instrumented
  Console procedure above before proposing fixes.
- If silence ever recurs despite a *successful* `resolved …` log line, the
  next candidates are: the specific voice asset broken on that device
  (re-download the voice in Settings), or an iOS 26.x regression not covered
  by the 2023-2025 forum record — capture the Console output first.
