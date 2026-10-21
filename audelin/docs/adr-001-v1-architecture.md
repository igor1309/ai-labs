---
date: 2026-10-21
model: claude-opus-5-5
description: "wisper v1 is one modular macOS app: record first, live ASR per track, ports and adapters"
---

# ADR-001 — One modular app for v1

## Executive summary

wisper v1 (scope in [mvp.md](../../research/wisper/mvp.md) § Versions) is one native macOS app.
It writes the mic and the call audio to disk as two tracks, and a live
Parakeet v3 stream per track reads that written audio. The streams' updates
become text that settles in place in a floating panel and is logged as
settled segments. The code is one local Swift package of small targets: pure
domain logic, features split into Core and UI, and adapters for everything
external, wired only by the app target. v1 does not prove that English terms
are recognised; that is an acceptance condition below.

## Context

The owner needs a smooth, selectable live transcript of Russian calls with
English terms ([needs.md](../../research/wisper/needs.md)). What shaped the decision:

- The spike ([tests.md](../../research/wisper/tests.md) runs 3–3b): FluidAudio's sliding window
  updates once per 4 s chunk, its unconfirmed updates cover only the newest
  chunk, some text appears only unconfirmed or in `finish()`, and words
  repeat at chunk edges. Smoothing has to be our own logic.
- Two live streams at once add CPU and ~30 MB but no wall time; each runs
  ~70× real time on file input (tests.md run 4). Capture-to-display latency
  is not measured.
- Granola lost the other side of a call after a Wi-Fi/VPN switch and kept no
  audio to redo it ([mvp.md](../../research/wisper/mvp.md) § Technical rules, from the
  [chat survey](../../research/wisper/chat-khakhalev-2026-10-21.md)).
- MacParakeet's window fell behind other windows and offered no useful
  selection actions (tests.md run 2).
- The owner asked for one app that is highly modular, following the layout
  of their iFora `swift-vortex` package ([mvp.md](../../research/wisper/mvp.md) § Code structure).

| Alternative | Why not |
|---|---|
| Separate recorder process plus a UI app, as Verger's service | Would keep recording through a UI crash, but adds a second process to supervise and an IPC contract before either is needed (capture permissions may also have to be granted to it separately, depending on the capture backend); the CLI is a Later item. Revisit if app crashes during calls are seen. |
| Fork Amanu | Its live engine is what we would replace ([mvp.md](../../research/wisper/mvp.md) § Shape). |
| Live ASR straight from capture | Audio a stall or crash does not keep is lost. |
| One mixed ASR stream | Loses «я»/«они»; two streams are cheap (run 4). |
| `raw.md` as the append-only record | Live text is replaced in place, and the first minutes can be filled in late ([mvp.md](../../research/wisper/mvp.md) § v4 screen details); an append-only Markdown file would hold provisional text or put late text out of order. |

## Decision

1. **One app process; one serialized owner per session.** A session (one
   call) has a single owner that applies every change in order: capture
   events, storage events, ASR updates, stop, rename. Every recognition run
   is identified by session, track, epoch and attempt; only the current
   attempt's results are accepted. Replacing an attempt revokes the old one
   first, without waiting for it to acknowledge. If the app crashes,
   recording stops with it; the audio written so far is kept.
2. **A session records, then catches up.** Stop ends recording in bounded
   time: capture stops, the audio is sealed, and the call is listed. The
   session then stays open in catch-up until every recorded range is
   recognised. Catch-up is the only way audio is recognised after recording,
   in v1: when the model arrives late, after a stall, and at the next launch
   for calls whose `meta.json` marks unrecognised audio (a reopened session).
   A new recording, a folder move or deleting that call cancels catch-up; the
   unrecognised range stays marked and catch-up resumes later.
3. **Record first.** Capture → Recorder → disk, two tracks, in short files
   ([mvp.md](../../research/wisper/mvp.md) § Recording files). File rotation does not make audio
   readable: audio becomes readable for ASR as soon as it is written.
   Recording never waits for recognition. If audio cannot be written (disk
   full, folder gone), the session shows an explicit "recording failed"
   state and stops capture; unwritten audio is never passed to recognition.
4. **A recognition watermark.** For each track and epoch the log records a
   watermark: the audio time up to which everything is accounted for, as
   committed text or as silence. It is not the last segment's time. It
   advances only together with the commits it covers, and never past audio
   whose text is still in the live tail (such as text FluidAudio returns only
   from `finish()`). A new attempt (restart or catch-up) may read earlier
   audio for context, but commits only words after the watermark; a segment
   that crosses it is cut at the watermark by word times, so nothing is
   logged twice or lost. If a segment cannot be written to the log,
   recognition of that track pauses, its text stays in the live tail and the
   call is marked incomplete; the audio is intact.
5. **One timeline, with epochs.** Both tracks share one session clock. A
   sleep, device change, permission loss or capture failure ends the track's
   current epoch and is recorded as a gap. The session owner decides whether
   to continue with one track, reacquire capture or stop. Recognition and the
   stabilizer never join audio or text across an epoch boundary: the live
   stream for the old epoch is finished and a new one starts.
6. **One live stream per track (per epoch):** mic is «я», call audio is «они». Each has
   its own stabilizer.
7. **The stabilizer is pure logic.** It keeps unconfirmed text, replaces it
   when confirmed text arrives and merges words repeated at chunk edges. It
   commits a segment (track, epoch, start and end time, text) only when the
   segment can no longer change: its text is confirmed and the next chunk's
   overlap has been merged, or the stream has finished. Segments commit in
   time order per track and epoch: a later segment waits while any earlier
   text is still in the live tail. Until committed, text is a live tail,
   shown in the panel.
8. **The segment log is the record, and committed segments are final.**
   Committed segments go to an append-only log in the call folder and are
   never revised. `raw.md` and the panel are both built from the same
   committed segments in time order; the panel adds the live tail. Late
   segments are new committed segments and land in their place by time.
9. **The panel keeps presentation state.** It holds a copy of the text,
   updated by incremental patches, plus selection and scroll. The session is
   the authority for content; the panel's copy is a projection of it. From
   v2 the hotkey takes an immutable snapshot of the selection and its
   context.
10. **Ports and adapters.** Cores declare the ports they need: audio capture,
   recording writer and recorded-audio reader, live recognition, call store,
   settings, model provider, clock. Live recognition and the v3 final pass are
   different ports that share audio references and transcript types. Only the
   app target creates adapters.
   **Logging is a decorator in the composition root** (owner, 2026-10-21).
   Only public interfaces are logged: the ports and each module's public
   API. The composition root wraps them in logging decorators that implement
   the same interface and log calls, results, errors and durations before
   passing them on. The decorators live in the app target; no module logs or
   knows it is being logged.
11. **One app-wide activity gate.** Anything that writes into call folders
    holds it: recording, catch-up, moving the calls folder and deleting a
    call. Recording and a folder move exclude each other ([mvp.md](../../research/wisper/mvp.md) §
    Edge cases); catch-up yields to all three, as in decision 2. One gate,
    defined in Domain and shared by LiveSessionCore and CallsCore; the app
    target creates the one instance.
12. **Setup in v1** asks for the calls folder and the live model. Recording
   may start before the live model is ready. Choosing a final-pass engine
   becomes mandatory with v3 ([mvp.md](../../research/wisper/mvp.md) § Final-pass engine).

Module layout (one local Swift package plus a thin app target):

```text
App target    entry point + composition root (with logging decorators)
Domain        CallDomain (call, meta.json, folder and title rules)
              TranscriptCore (stabilizer, edge merge, segments, track merge)
Features      LiveSessionCore / LiveSessionUI (NSPanel + NSTextView)
              CallsCore / CallsUI
              SetupCore / SetupUI
Adapters      AudioCapture · Recorder · FluidAudioASR
              FileCallStore · SettingsStore · ModelStore
```

## Rules / invariants

Module dependencies (production targets; a test target MAY depend on its
subject, the modules its subject depends on, and test frameworks):

1. Domain MUST NOT depend on any other module of ours.
2. A feature Core MAY depend on Domain only; a UI target MAY depend on its own
   Core and Domain only.
3. An adapter MAY depend on Domain and on the Core whose ports it implements;
   adapters MUST NOT depend on each other.
4. Only the app target MAY depend on every module and create adapters.
5. Every production target MUST have a test target.

Apple and third-party frameworks:

6. Domain and Core targets MUST use Foundation only: no AVFoundation,
   CoreAudio, AppKit or FluidAudio.
7. UI targets MAY use AppKit and SwiftUI; adapters MAY use what they wrap.

Behaviour:

8. Recognition MUST read only audio the Recorder has written; it MUST NOT
   read from capture.
9. Recording MUST NOT wait on recognition.
10. Only FileCallStore MAY write into a call folder; the Recorder writes
    through the recording-writer port that FileCallStore implements. A call is
    found by the id in `meta.json`, never by its path.
11. The segment log MUST be append-only and committed segments MUST NOT be
    revised; `raw.md` and the panel MUST be built from the same committed
    segments.
12. A gap in capture MUST be recorded, not hidden, and recognition and the
    stabilizer MUST NOT join audio or text across it.
13. Session state MUST change only through the session's owner; the panel's
    copy MUST be derived from it.
14. TranscriptCore MUST be tested against the spike's recorded updates,
    without audio or a model.
15. Stop MUST end recording in bounded time even if recognition stalls or
    never had a model; unrecognised audio MUST stay marked until catch-up
    recognises it.
16. Recording and moving the calls folder MUST NOT run at the same time;
    nothing MAY write into a call folder without holding the activity gate.
17. Only the current recognition attempt MAY commit segments, in time order,
    and only words after its track's watermark; after each commit the
    watermark is at or past the committed text. The watermark MUST NOT pass audio that is
    not yet committed or known silent.
18. Audio that failed to be written MUST NOT reach recognition.
19. Logging MUST happen only in logging decorators in the composition root,
    and only on public interfaces; no module MAY log.

## Consequences

- Each module is testable alone. The hardest logic, the stabilizer, runs in
  deterministic tests with no audio and no model.
- A crash ends the recording; nothing written is lost, and the saved audio
  can be transcribed again. Resuming a live transcript mid-call after a crash
  is not promised.
- Writing audio and reading it back costs disk traffic that run 4 did not
  include.
- More targets and protocols than a single-target app; accepted for the
  owner's modularity requirement.
- Every call across a public interface can be traced without touching
  module code. What happens inside a module is not logged; it shows only
  through the calls it makes. The cost is one decorator to keep in step with
  each interface.
- Text still in the live tail when the app crashes is lost from the log, but
  its audio is kept and can be recognised again.
- The v3 final pass, audio compaction and 7-day retention are post-recording
  jobs. v3 decides whether they extend catch-up or get their own lifecycle;
  this ADR keeps the final pass off the live port.

Acceptance before v1 is done:

- Capture-to-display delay through the record-first path, measured on a real
  call.
- Selection survives appends, in-place replacement and late insertion.
- A blocked recogniser does not stop recording, and Stop still finalizes
  the call.
- Text that appears only in `finish()` reaches the log.
- A restarted attempt and catch-up after relaunch log no text twice and lose
  none; a revoked attempt's late results are ignored.
- A full disk during recording shows "recording failed" and stops capture.
- A synthetic interruption leaves a visible gap and no text joined across
  it.
- Starting a recording and starting a folder move at once: exactly one
  succeeds.
- FluidAudio gives word times precise enough to cut a segment at the
  watermark. If it does not, the watermark moves only at segment boundaries
  and replay starts from the last one; this ADR is amended before build.
- Parakeet v3 on clean Russian speech with RACI, OKR and SLA (tests.md § Not
  yet measured). If the terms come out in Cyrillic or wrong, as in run 3,
  live terms are not usable for v2 explanations, and the live engine is
  revisited before v2.

## Non-goals

- A background service, CLI or agent access in v1.
- The final pass, summaries, bb explanations and calendar titles (v2–v3).
- Mechanics left to the spec: the stop and stall time limits (set in the
  spec, tuned while profiling and using the app; owner, 2026-10-21), the log
  destination and levels, the system-audio capture backend (Core Audio
  tap or ScreenCaptureKit), file formats, how written audio is signalled to
  readers, durability and flush policy, the segment log's format, crash
  repair of a half-written file, the concurrency primitives, and text range
  mapping in the panel.
- Echo cancellation: v1 assumes headphones.
