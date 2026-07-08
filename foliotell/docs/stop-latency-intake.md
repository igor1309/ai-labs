---
date: 2026-07-08
model: claude-fable-5
description: "Intake brief: fix FolioTell stop latency on device — Stop leaves speech audible for seconds (iPhone 15 Pro, iOS 26.5, v0.0.3)"
---

# Intake Brief — FolioTell: Fix Stop Latency on Device

Source: `foliotell/backlog/product.md` § "Fix stop latency on device".
Investigation ledger: [`device-speech.md`](device-speech.md).

## What I'm Building

A bug fix in two backlog-ordered stages: first a measured on-device
reproduction (seconds from Stop tap to silence; variance by voice type and
speech speed), then a fix such that Stop silences output well under a second,
with Pause held to the same responsiveness bar. The defect: on a real iPhone
(15 Pro, iOS 26.5, v0.0.3) pressing Stop flips the UI back to "Play"
immediately, but audio keeps playing for several seconds. The UI-vs-audio
split matters — the app believes it stopped (state machine goes `idle`
synchronously) while the synthesizer keeps producing sound.

## What I'm Touching

- `Sources/App/SpeechController.swift` `stop()` — state machine → `idle` and
  UI published first, then `synthesizer.stopSpeaking(at: .immediate)` (its
  `Bool` result is ignored), then synchronously `deactivateAudioSession()` in
  the same call.
- `SpeechController.swift` `didCancel` delegate callback — calls
  `deactivateAudioSession()` a second time when the cancel actually lands.
- `SpeechController.swift` `deactivateAudioSession()` —
  `setActive(false, options: .notifyOthersOnDeactivation)`; failures are
  caught and only `print`ed — not surfaced via the `Logger` the controller
  otherwise uses.
- `SpeechController.swift` pause path — `pauseSpeaking(at: .word)`
  (deliberate — resume quality); stop uses `.immediate`. The backlog holds
  pause to the same responsiveness bar.
- `Sources/Core/PlaybackStateMachine.swift` `stopRequested()` /
  `speechCancelled()` — state goes `idle` at request time, not at
  cancel-confirmation time.
- `docs/device-speech.md` — this bug is listed in its Open Questions; the
  Console diagnostic procedure and the hypothesis table are where
  investigation results must land.

## Findings

- Scope: read `SpeechController.swift` (current, post-#713),
  `PlaybackStateMachine.swift` stop/cancel paths, `docs/device-speech.md`
  (full), `docs/log.md`, the backlog item, the Maestro flow, and the release
  runbook location. Excluded: voice-selection internals, normalization
  pipeline (orthogonal).
- Pattern evidence: the project already ran one full device-audio
  investigation loop (silent reading, v0.0.1→v0.0.3) with a documented
  method — hypothesis table, falsified-fixes ledger, Console-based
  diagnostics, forum-record citations. That structure is the template for
  this bug.
- The stop sequence is: UI/state reset → `stopSpeaking(at: .immediate)` →
  immediate `setActive(false)` — then a second `setActive(false)` when
  `didCancel` fires. Deactivating the session while the synthesizer is still
  draining is the interplay the backlog flags; a `setActive(false)` failure
  is only `print`ed, invisible to the Console flow filtering the
  `foliotell.FolioTell` subsystem.
- `stopSpeaking`'s return value is ignored; the state machine is `idle`
  regardless of whether the synthesizer accepted the stop.
- Delegate callbacks firing does not prove audio state (documented) —
  machine-side timestamps (stop call → `didCancel`) may misstate the audible
  delay; tap-to-silence needs human/audio-capture measurement.
- The simulator's speech stack differs materially from device (documented) —
  the bug is device-only until proven otherwise; the Maestro flow asserts UI
  state around Stop, not audio.
- The forum record cited in device-speech.md concerns silence, not stop
  latency; no falsified hypotheses exist for this symptom. The hypothesis
  table ends at 0.0.3 — this investigation extends it.

## Key Constraints

- Stop must silence audio well under one second; pause equally responsive
  (backlog acceptance bar).
- Do not re-propose falsified fixes from the device-speech history; new
  findings land in `device-speech.md` (hypothesis table + open questions),
  the canonical investigation ledger.
- The `.playback`/`.spokenAudio` session config is load-bearing (mute-switch
  behavior) — any fix must preserve it; the catalog-based voice resolution
  from #713 must not regress.
- Pause's `.word` boundary was a deliberate choice for resume quality;
  "equally responsive" must not silently trade that away without a recorded
  decision.
- Native frameworks only; verification gates `swift test`/`swift build`; new
  Swift sources must also be registered in
  `FolioTell.xcodeproj/project.pbxproj` (`.agents/foliotell.md`).
- Trunk is protected; work goes through a PR from a branch.

## Risks & Unknowns

- The core unknown is where the seconds go: inside the synthesizer (stop
  accepted but the audio buffer drains slowly — possibly
  voice-class-dependent), in the session teardown (the immediate
  `setActive(false)` failing or racing the drain), or in stop not being
  accepted at all in some synthesizer state (return value ignored). These are
  investigation axes, not yet evidenced hypotheses.
- Device dependence: reproduction and every fix-verification cycle need the
  physical iPhone; the simulator likely cannot reproduce.
- iOS 26.5 is newer than the cited forum record (2023–2025); this may be an
  OS regression with no public record yet.
- The double `deactivateAudioSession()` (in `stop()` and again in
  `didCancel`) has unclear intent — no comment or test pins which one is
  load-bearing.
- Unit-testability is poor: the latency lives in `AVSpeechSynthesizer` +
  `AVAudioSession` on device. Regression protection will likely be structural
  (what gets called, in what order) rather than a timing assertion.

## Reproduction

Not unit-testable — device-side audio behavior. Manual reproduction,
extending the documented diagnostic procedure:

1. On the iPhone (15 Pro, iOS 26.5), open the Pushkin document in FolioTell
   v0.0.3+, press Play, let it speak.
2. Press Stop while recording the screen (screen recording captures audio +
   visible tap time) — or with Console.app streaming the
   `foliotell.FolioTell` subsystem.
3. Measure tap-to-silence from the recording. Expected (buggy): audio
   continues for multiple seconds after the button flips to "Play". Pass bar
   after fix: < 1 s.
4. Repeat matrix: compact vs. enhanced/premium voice for the active language,
   and at 1× vs 2× speed — the backlog asks whether the delay varies along
   both axes.
5. Same matrix for Pause responsiveness.

Instrumentation gap for the measurement stage: `stop()` currently logs
nothing, and session-deactivation failures go to `print` — the Console-based
procedure cannot see either today.

## Resolved Questions

- Investigation loop runs via direct Xcode installs to the user's connected
  iPhone (fast iteration, full Console access); TestFlight serves only as
  final confirmation. The user runs the on-device measurement steps (their
  hands and ears). (User decision, 2026-07-08.)
