---
date: 2026-07-09
model: claude-fable-5
description: "Bug analysis: playback latency regression and play/pause desync after the 0.6.0 reader-controls split — ranked root-cause hypotheses and the integration-test gaps that let them land"
---

# Playback Latency & Play/Pause Desync — Debugging Analysis

Analysis only — no code changes. Companion ledger:
[`device-speech.md`](device-speech.md); architecture contract:
[`adr/adr-002-playback-rx-architecture.md`](adr/adr-002-playback-rx-architecture.md).
No Swift toolchain was available in the analysis environment, so every
finding below is from code reading and git history; on-device verification
steps are listed at the end.

## Executive Summary

Reported: significant playback latency is back (previously solved), and the
play/pause button disagrees with actual playback, which refuses to stop.

Most likely causes, ranked:

1. **The 0.6.0 controls split (`c36d6b1`) deleted the menu-isolation fix
   (`7097afd`)** — both bottom-bar menus are rebuilt on every spoken-word
   tick again. This is the third occurrence of the same documented defect
   class (per-word/per-render main-thread churn), which previously produced
   the 0.1.0 settings-menu freeze and the 0.0.3 stop latency. The regression
   test that was supposed to pin the fix asserts the *value struct*, not the
   view wiring, so it stayed green while the fix was removed.
2. **Per-word O(document) work in `ReaderSessionView.renderState`** — full
   front-matter re-parse, full-document language scan, and voice-option
   sorting run on every word-boundary callback, multiplying finding 1.
3. **A retain cycle in the composition root leaks the entire playback stack
   (including `AVSpeechSynthesizer`) per document open**; teardown hangs on a
   single `onDisappear`. An orphaned synthesizer that keeps speaking while a
   fresh session's buttons control a different synthesizer exactly matches
   "buttons out of sync, playback refusing to stop".
4. Silently dropped pause/stop acceptance failures, a per-utterance
   main-actor `speechVoices()` call in the adapter, and an async
   voice-catalog race that can restart or spontaneously resume playback.

Key code areas: `Sources/App/ReaderScreen.swift` (`ReaderSessionView`),
`Sources/App/ReaderView.swift`, `Sources/App/ReaderComposition.swift`,
`Sources/App/SpeechSynthesizerAdapter.swift`,
`Sources/Core/PlaybackTransport/*`.

## Bug Context

- **Observed:** noticeable delay between transport taps and audible effect;
  play/pause button state diverges from what is heard; stop/pause sometimes
  leaves audio running.
- **Expected:** sub-second tap-to-effect (the recorded acceptance bar from
  the stop-latency investigation), button state always tracking audible
  state.
- **Reproduction:** not re-measured in this analysis (no device); the
  history in `device-speech.md` documents the measurement procedure.
- **Environment:** device-class symptoms (iPhone 15 Pro, iOS 26.x
  historically); the simulator's speech stack differs materially.
- **Timeline evidence:** playback was rebuilt on two IMRX machines in 0.4.3
  (`4f35401`, ADR-002) with behavior parity as the contract; the menu
  isolation fix `7097afd` shipped right after; 0.6.0's
  `c36d6b1` ("split reader settings and playback controls") rewrote the
  bottom bar and dropped that isolation.

## Execution Path

Tap-to-audio path (primary control):

1. `ReaderView` button → `event(.primaryTapped)` →
   `ReaderSessionView.handle` → `transport.event(.primaryTapped(request))`.
2. `RxViewModel.event` schedules via `EventScheduler.mainQueue` —
   **+1 main-queue hop** (`RxViewModel.swift:31-35`).
3. `PlaybackTransportReducer.primaryTapped` → `.beginSpeaking` /
   `.pause(utteranceToken:)` / `.resume(utteranceToken:)`.
4. `PlaybackTransportEffectHandler` → `SpeechSynthesizerAdapter`:
   `beginSpeaking` = optional `stopSpeaking()` → `activateAudioSession()`
   (synchronous `AVAudioSession.setActive(true)`, main thread) → `speak()`
   (synchronous `AVSpeechSynthesisVoice.speechVoices()` catalog query for
   Auto voice, main actor) → `synthesizer.speak`.
5. Pause/resume effects dispatch `pauseResolved`/`resumeResolved` back
   through the scheduler — **+1 more hop** before the button flips.
6. Word boundaries flow back: delegate (`nonisolated`) → `Task { @MainActor }`
   → `dispatch` → scheduler hop → reducer → `@Published` state → SwiftUI.

Observation path (per spoken word):

`transport.$state` fires → `ReaderSessionView.body` re-evaluates →
`renderState` recomputed → new `ReaderRenderState` (progress changed) →
full `ReaderView` body rebuild, **including both bottom-bar `Menu`s** →
binder (`ReaderSession.init`) forwards the offset to the position machine →
anchor derivation (bounded, per ADR) → possible `persistAnchor`.

The divergence point for the desync symptoms is steps 2–5: the button icon
derives from machine state that trails the tap by ≥2 main-queue hops, and
those hops queue behind the per-word render churn from the observation path.

## Hypotheses (ranked)

### H1 — 0.6.0 removed the menu re-render isolation (high confidence)

- **Evidence:** `7097afd` wrapped the settings menu in a private
  `ReaderSettingsMenu` view with `.equatable()` keyed on
  `ReaderSettingsMenuState` ("intentionally excluding word-level playback
  progress"). `c36d6b1` deleted `ReaderSettingsMenu` and its `Equatable`
  conformance and now builds `voiceMenu` and `playbackMenu` inline from the
  full `ReaderRenderState` (`ReaderView.swift:313-372`).
  `ReaderRenderState.settingsMenuState` (`ReaderView.swift:47-56`) is dead
  code — nothing in production references it anymore.
- **Mechanism:** every `willSpeakRange` word callback changes `progress` →
  new render state → both `Menu`s (toolbar items on iOS 26 Liquid Glass)
  are rebuilt several times per second. The same class of per-word UI churn
  is on record twice: the 0.1.0 settings-menu freeze and the 0.4.x open-menu
  instability (`docs/log.md`, `device-speech.md` hypothesis table row
  0.1.1). Main-thread saturation delays the `.mainQueue`-scheduled tap
  events, so taps land late or seem ignored — perceived latency plus
  play/pause desync.
- **Why the regression net missed it:**
  `ReaderRenderStateTests.test_settingsMenuContent_shouldRemainStable_onPlaybackTick`
  asserts `stateBeforeTick.settingsMenuState == stateAfterTick.settingsMenuState`
  — a tautology about the value struct. It does not assert that the view
  actually routes menu rendering through that state, so deleting the
  `.equatable()` wiring kept it green.

### H2 — Per-word O(document) work in `renderState` (high confidence)

- **Evidence:** `ReaderSessionView.renderState`
  (`ReaderScreen.swift:161-177`) runs on every body evaluation:
  - `FrontMatterRendering.renderableText(from: document.text)` — splits the
    whole document into lines and re-joins them (two full-document string
    allocations per evaluation, `FrontMatterRendering.swift:10-31`);
  - `detectedDocumentLanguageCode` → `SpeechVoiceLanguage.languageCode(for:)`
    — a unicode-scalar scan that traverses the **entire** speech text for
    any document without Cyrillic characters (`SpeechVoiceLanguage.swift`);
  - `voiceOptions` — set construction, filtering, and
    `localizedCaseInsensitiveCompare` sorting of the catalog.
- **Mechanism:** body evaluations occur per spoken word (H1's trigger), so
  the main thread does O(document) work several times per second on
  book-length documents. Fresh `String` instances from `joined()` also
  defeat cheap `Text` equality (memcmp per word).
- **Note:** present at 0.5.0 too, so not the 0.6.0 delta alone — but ADR-002
  bounded per-word work for the *position machine* ("per-spoken-word work
  MUST be bounded by lookup") and no equivalent bound was ever placed on the
  *view* side of the observation boundary.

### H3 — Retain cycle leaks the playback stack; teardown hangs on `onDisappear` (high confidence by construction)

- **Evidence:** in `ReaderComposition.makeReaderSession`
  (`ReaderComposition.swift:81-100`):
  - `transport` (an `RxViewModel`) strongly holds
    `transportEffectHandler.handleEffect` (partially-applied method retains
    the handler);
  - the handler's injected closures strongly capture `synthesis`;
  - the adapter's `dispatch` closure `{ transport.event($0) }` strongly
    captures the `transport` var.
  Cycle: **transport → handler → adapter → transport.** No `weak` link
  exists anywhere on that loop (the `[weak position]` captures cover only
  the position machine).
- **Mechanism/consequences:**
  - Every document open leaks one `AVSpeechSynthesizer` + transport machine
    + handler; `ReaderSession.deinit` releases only its own references.
  - The only stop-on-close is `ReaderSessionView.onDisappear →
    transport.event(.stopTapped)` (`ReaderScreen.swift:109-111`) — a view
    callback, scheduled one more runloop later. If it does not fire (app
    scene teardown, `DocumentGroup` document swap quirks) or the app is
    interrupted before the queued event processes, the orphaned synthesizer
    keeps speaking with no UI attached, while a freshly composed session's
    buttons control a *different* synthesizer — exactly "buttons out of
    sync, playback refusing to stop".
  - The transport↔position binder lives in `ReaderSession` (which does
    deallocate), so a leaked transport that is still speaking no longer
    feeds the position machine — progress and anchors silently freeze.
- **Confidence note:** the cycle is certain from the code; how often the
  audible orphan manifests depends on `onDisappear` reliability, which needs
  device verification.

### H4 — Pause/stop acceptance failures are silently dropped (medium)

- **Evidence:** `pauseResolved(accepted: false, …)` and any token mismatch
  fall through to "ignore" with no effect, no retry, no UI signal
  (`PlaybackTransportReducer.swift:238-247`). The adapter's
  `pauseSpeaking(at: .word)` legitimately returns `false` before the
  synthesizer has actually started speaking — a window that includes voice
  resolution, audio-session activation, and engine spin-up (seconds on a
  cold device per the ledger).
- **Mechanism:** tap play → (startup stall) → tap pause inside the window →
  pause refused → event dropped → audio starts and keeps playing while the
  user believes they paused. The button also flips only on `pauseResolved`
  (two hops after the tap), so under H1/H2 load it visibly lags the tap.
  Stop has the inverse split, on record in
  [`intake/stop-latency-intake.md`](intake/stop-latency-intake.md): UI goes
  `idle` synchronously while `stopSpeaking`'s result is ignored.
- **Note:** acceptance semantics are behavior-parity with the legacy
  controller — but the legacy controller resolved pause in the same runloop
  pass as the tap; the Rx pipeline adds ≥2 hops, widening the visible gap.

### H5 — Per-utterance main-actor `speechVoices()` in the adapter (medium)

- **Evidence:** `SpeechSynthesizerAdapter.automaticVoice(matching:)`
  (`SpeechSynthesizerAdapter.swift:83-103`) calls
  `AVSpeechSynthesisVoice.speechVoices()` synchronously on the main actor on
  **every** `speak` for Auto-voice users — every play, resume-from-jump,
  sentence jump, speed change, and restart. The ledger's key fact:
  "`speechVoices()` can stall for **seconds** on device — never call it on
  the main thread or per render." The view's own `loadAvailableVoices()`
  (`ReaderScreen.swift:295-299`) documents and follows that rule; the
  adapter violates it.
- **Mechanism:** the stall sits directly on the tap→audio path (perceived
  start latency) and blocks the main thread, so a pause/stop tapped during
  it queues behind — feeding H4's refusal window.
- **Note:** pre-existing in the legacy controller (the OS may cache after
  first call), so ranked below the true regressions; still a standing
  violation of the recorded rule, and a hidden collaborator (AVFoundation
  static) that no test can see — the adapter has no catalog seam.

### H6 — Voice-catalog race restarts or spontaneously resumes playback (low-medium)

- **Evidence:** `selectedVoiceIdentifierForPlayback`
  (`ReaderScreen.swift:220-226`) returns `nil` until `availableVoices`
  loads (detached task, can take seconds). For a user with an explicit
  stored voice, catalog arrival flips the value `nil → id`;
  `.onChange(of: selectedVoiceIdentifierForPlayback)` then sends
  `.voiceChanged(id)`.
- **Mechanism:** if speaking, `settingChanged` replaces the utterance
  (stop + activate + speak) seconds into playback — an audible restart. If
  **paused**, `settingChanged` → `speakFreshUtterance` returns `.speaking`
  (`PlaybackTransportReducer.swift:213-236`) — playback starts by itself
  with no user tap. Both read as "controls out of sync". Play tapped before
  the catalog loads also starts with the wrong (auto) voice.

### H7 — Stop-path audio-session deactivation lost its retry (low)

- **Evidence:** `.stopPlayback` runs `stopSpeaking()` then an immediate
  `setActive(false)` (`PlaybackTransportEffectHandler.swift:48-50`). The
  stop-latency intake flagged deactivating while the synthesizer drains as
  failure-prone; the legacy controller retried deactivation in `didCancel`.
  The reducer now ignores the stale terminal callback entirely
  (`utteranceEnded`, token already consumed by `stopTapped`), so a failed
  deactivation is never retried — only logged.
- **Impact:** audio session can stay active after stop (other apps stay
  ducked); not itself audible latency.

### H8 — Front-matter mode change mid-playback corrupts anchors (low, latent)

- **Evidence:** `.frontMatterModeChanged` goes only to the position machine
  (`ReaderScreen.swift:118-120`), which rebuilds its `SpeechDerivation`.
  The transport keeps speaking the **old** speech text and reporting offsets
  in the old coordinate space; the binder
  (`ReaderComposition.swift:41-46`) forwards raw `Int` offsets with no text
  identity, and the position machine maps them through the **new**
  derivation.
- **Impact:** wrong anchors persisted while speaking with the settings sheet
  open. The binder contract (spoken offsets are only meaningful relative to
  the transport's session text) is unstated and unasserted.

## Supporting Evidence

- `git show c36d6b1 -- foliotell/Sources/App/ReaderView.swift` — deletion of
  `ReaderSettingsMenu`, its `Equatable` conformance, and the `.equatable()`
  call site.
- `Sources/App/ReaderView.swift:47-56` — `settingsMenuState` now dead code.
- `Tests/App/ReaderRenderStateTests.swift` — struct-equality-only regression
  test.
- `Sources/App/ReaderComposition.swift:81-100` — the cycle wiring.
- `docs/device-speech.md` — hypothesis-table row 0.1.1 (stop latency
  resolved by removing per-render `speechVoices()`), plus the "stop delivers
  `didFinish`, not `didCancel`" runtime quirk that the token scheme must
  keep absorbing.
- ADR-002 "Rules / Invariants" — the per-spoken-word bound that the view
  layer now violates in spirit.

## Verification Steps

On-device (procedure per `device-speech.md`, info-level logging enabled):

1. **H1/H2:** Instruments Time Profiler while a book-length document plays —
   look for per-word main-thread spikes in SwiftUI render + string work.
   Compare against a build with `c36d6b1`'s view change reverted.
2. **H3:** Xcode memory-graph debugger after opening/closing a document
   several times — count live `SpeechSynthesizerAdapter` /
   `RxViewModel<PlaybackTransportState…>` instances. Kill-test: start
   playback, swipe the document closed fast, listen for orphaned speech.
3. **H4:** Console filter `foliotell.FolioTell`, tap pause immediately after
   play — look for `pause requested; pauseSpeaking(at: .word) accepted:
   false` with no state change following.
4. **H5:** log timestamps around `speak` — measure `resolved … catalog
   voices` latency on a cold device start.
5. **H6:** set an explicit voice, cold-start the app, play within the first
   second — listen for a mid-sentence restart when the catalog loads; pause
   during that window and watch for spontaneous resume.

## Integration-Test Gap (requested focus)

Per-machine reducer tests are thorough (transition cells, token staleness),
and `ReaderCompositionTests` proves the wiring exists — but only through
single-event happy paths (`play`, one `willSpeakRange`, `didFinish`, one
idle jump) with the `.immediate` scheduler. Missing coverage, in priority
order:

1. **View-boundary regression pin for H1:** a test that fails when menu
   rendering is no longer isolated from word-level progress — e.g. assert
   the production view routes menus through an `Equatable`-isolated subview
   (snapshot of body identity, or at minimum a compile-time reference that
   makes `settingsMenuState` load-bearing again). The existing struct-only
   test provides false confidence and should be replaced alongside the fix.
2. **Multi-step transport scenarios asserting consequences:**
   - play → pause(accepted) → resume(refused) → exactly one fresh
     `speak` from the paused offset, token incremented;
   - play → pauseResolved(accepted: false) → still `.speaking` (pins the
     dropped-pause behavior and forces the retry/UI-signal design decision);
   - stop → late `didFinish`/`didCancel` with the stale token → no anchor
     clear, no second deactivation (the ledger's didFinish-after-stop
     quirk);
   - jump-while-paused → `cancelUtterance` → primary tap → fresh utterance
     from the repositioned offset;
   - speed/voice change while paused → currently auto-resumes: pin it or
     reject it explicitly.
3. **Lifecycle/deallocation test for H3:** create a session via
   `makeReaderSession`, release it, assert `weak` references to transport,
   handler, and adapter go `nil`. This one test would have caught the cycle
   the day it was written.
4. **Scheduler-realistic ordering:** all composition tests use
   `.immediate`; production uses `.mainQueue`. At least one test should
   drive interleaved tap + delegate-callback sequences through a controllable
   queued scheduler to exercise the two-hop resolution windows (H4).
5. **Cross-machine coordinate contract for H8:** front-matter mode change
   while speaking — asserts either a defined behavior (transport restarts
   with re-derived text) or rejection; today it would document the
   offset-space mismatch.
6. **Adapter seam for H5:** the voice-catalog query is an invisible
   collaborator (AVFoundation static). Inject a catalog provider into
   `SpeechSynthesizerAdapter` so a structural test can assert "no catalog
   query on the speak path" (or "query cached off-main once"), matching the
   effect-handler injection style ADR-002 mandates.

## Impact

Left unresolved: playback controls degrade with document length (H1/H2),
memory and possibly audible ghost playback accumulate per document (H3),
and pause/stop remain fail-silent (H4) — together reproducing the exact
symptom set that previously cost a full device-investigation loop, now
without the test net that was supposed to prevent the recurrence.

## Assumptions and Unknowns

- No device measurements were taken in this analysis (no Swift toolchain,
  no device); H1–H3 are code-certain mechanisms whose *magnitudes* need the
  verification steps above.
- Assumed `onDisappear` is the only teardown path for the session (no other
  stop-on-close call was found; `ReaderSession` has no `deinit`).
- Whether iOS caches `speechVoices()` after first call on 26.x is unknown;
  the ledger treats it as stall-capable per call.
- The exact user-observed reproduction (document size, voice, cold/warm
  start) was not provided; the ranked hypotheses cover the plausible
  combinations rather than one confirmed trace.
