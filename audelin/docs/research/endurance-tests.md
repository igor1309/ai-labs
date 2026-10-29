# Endurance and load tests (2026-10-29)

How to test that Audelin survives a 3-hour call and a loaded Mac without
waiting 3 hours per check. Profiling metrics and budgets are a separate note
(LAB-748); this one is about tests.

## What went wrong, and what it teaches

The first real-call crash (LAB-751) grew with a count, not with time: the
microphone's receive closure, stored bare in a `Mutex`, was wrapped in one
more thunk pair on every buffer delivery (about 47 a second). Calling
through it overflowed the stack mid-call; releasing it on stop overflowed
again. A real call died after roughly 11k–25k deliveries, 4 to 9 minutes.

- Delivering buffers in a loop reproduced it with no real time: stack depth
  inside `receive` went 21 → 2019 → 4019 at 1, 1000 and 2000 deliveries.
- `FakeMicrophoneBinding` skips `NativeTap`, where the bug was. A long test
  on the fake would have passed.
- Memory hardly moved. A memory-only soak would have missed it; stack depth
  caught it.
- The cause is a pattern (`Mutex` holding a closure), and the same pattern
  sat in `TranscriptFailureReport`. One static check covers the class.

## How others do it

- **Simulated time (TigerBeetle VOPR, FoundationDB).** Replace the clock,
  network and disk with controllable fakes and run the real code under them;
  TigerBeetle reports about an hour of simulation per month of real time.
  Runs are seeded, and seed plus commit replays a failure exactly. Both still
  run real systems too, because a fake cannot show what its model leaves out.
  [VOPR](https://docs.tigerbeetle.com/about/vopr),
  [browser post](https://tigerbeetle.com/blog/2023-07-11-we-put-a-distributed-database-in-the-browser)
- **pluginval (audio plugins).** Strictness levels 1–10: low levels are
  quick call-coverage crash checks; high levels add parameter fuzzing,
  concurrent parameter calls from several threads, state restore checks,
  oversized blocks and detecting allocations on the audio thread. Tests can
  repeat N times, in random order, with a fixed seed. CI runs level 5–10
  with a timeout.
  [README](https://github.com/Tracktion/pluginval/blob/develop/README.md),
  [CI talk](https://ccrma.stanford.edu/~jatin/slides/ADC21-cicd/)
- **Chromium / WebRTC.** A fake audio input stream generates a beep or
  plays a WAV file (`--use-file-for-fake-audio-capture`) under a fake-device
  flag, so whole-browser tests run with no hardware. Glitches are counted,
  not timed: `AudioGlitchInfo` (count, duration) is summed over callbacks and
  reported as glitch duration per mille of callback time; WebRTC counts
  `concealedSamples` and `concealmentEvents` against `totalSamplesReceived`.
  [fake input](https://chromium.googlesource.com/chromium/src/+/74.0.3729.169/media/audio/fake_audio_input_stream.cc),
  [device stats](https://gitcode.com/openharmony-tpc/chromium_src/blob/master/media/audio/audio_device_stats_reporter.cc),
  [concealed samples](https://webrtc.googlesource.com/src/+/2dbc69fa64a7ea183e090dbfaa68ab16d4bcef7a)
- **Apple.** `AVAudioEngine` offline manual rendering runs the graph with
  "no deadlines or real-time constraints", usually much faster than real
  time; WWDC 2017 suggests it to test and debug a live engine setup.
  Whether an input-node tap fires under manual rendering is unverified.
  XCTest's `XCTMemoryMetric`/`XCTCPUMetric` exist, but forum reports say
  their baselines are unreliable on macOS.
  [offline processing](https://developer.apple.com/documentation/avfaudio/performing-offline-audio-processing),
  [WWDC 2017 501](https://nonstrict.eu/wwdcindex/wwdc2017/501/),
  [baseline thread](https://developer.apple.com/forums/thread/741247)
- **Real-time safety checkers.** LLVM's RealtimeSanitizer
  (`-fsanitize=realtime`, `[[clang::nonblocking]]`) fails on allocation or
  locking inside a real-time function. It is C/C++ only; Swift has no
  supported equivalent.
  [RTSan](https://clang.llvm.org/docs/RealtimeSanitizer.html)
- **Loopback on a real Mac.** BlackHole is a virtual audio driver (Homebrew
  `blackhole-2ch`, no kernel extension); Mozilla installs it on its macOS
  test machines for loopback tests.
  [BlackHole](https://github.com/ExistentialAudio/BlackHole),
  [Mozilla bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1764901)
- **Generic soak testing.** Compare checkpoints after warm-up and report a
  growth rate per hour; a steady upward trend is a leak, a rise and fall is
  not. [RadView](https://www.radview.com/blog/soak-testing-software-playbook-memory-leak-detection-stability/)

## What to adopt

**Assert growth per unit of work, not the end state of a long run.** Run
the real code for N and then 10·N units (deliveries, segments, transcript
entries) and assert that what should stay flat does: stack depth, retained
objects, queue depth, memory footprint. Bytes written and entries kept
should grow in proportion. Comparing slopes catches the LAB-751 bug at a few
hundred deliveries, so it fits CI's 120 s bound; reaching the crash at 25k
would not be needed.

**Drive the lowest seam.** Each count test feeds the adapter's own
boundary with the OS, not a fake of the adapter: `NativeTap` and
`MicrophoneEngine.installTap` for the microphone, `CaptureBinding` for call
audio. Fakes above that boundary stay useful for logic tests only.

**Count losses; do not time them.** Frames in equal frames written, per
track; dropped or concealed frames are counted; stop completes and the files
close. These are exact and do not flake on a slow runner.

**Seed every random schedule.** A load or fault test that varies chunk
sizes, stalls or failure points takes a seed, prints it, and replays from
it.

## Test tiers

| Tier | What it runs | Catches | Runtime | Where |
| --- | --- | --- | --- | --- |
| 0. Static checks | A test that reads the sources | Known bad patterns: `Mutex` holding a closure; a stream on the capture path with no explicit buffering policy | < 1 s | CI |
| 1. Count tests | Each adapter and flow at its lowest seam, N vs 10·N units, synthetic audio | Per-delivery growth in stack, objects, queues; stop after a long run | seconds each | CI, inside the 120 s bound |
| 2. Compressed call | The composed session from capture seams to transcript files, 3 hours of synthetic two-track audio fed as fast as it goes, injected clock, fake recogniser | Growth across the whole pipeline: transcript entries, log volume, file writers, panel state; final flush | minutes | Opt-in / nightly on the Mac runner |
| 2b. Compressed call, real models | The replay tool over a 3-hour looped fixture, unpaced | Recogniser and Live text growth over 3 hours of audio | ~7 min a track at the measured 3.2–3.8% compute/audio | Opt-in |
| 3. Load and faults | Tiers 1–2 with seeded stalls and failures | Unbounded buffers behind a stalled consumer, a slow recogniser, write errors, format change mid-stream, device loss | as tier 1–2 | CI (short), opt-in (long) |
| 4. Real-time soak | The app on a real Mac, 3 hours, BlackHole loopback: a looped speech fixture as the call side and as the mic, counter-only metrics | Real audio threads (the mid-call overflow hit the AVFAudio messenger thread), scheduling, heat, sleep/wake, a real call app | 3 h | Manual, overnight, before a release |

Tier 4 is the only one that needs real time. It runs rarely and only checks
what tiers 0–3 cannot model; a failure there becomes a tier 1–3 test once
its count or fault is known, as LAB-751 did.

## Candidates already in the code

- Streams created without a buffering policy (unbounded), which grow if
  their reader stalls: `LiveAudio.swift` (output),
  `Compose/LoggingCapture.swift`, `Compose/RecordedCaptureAdapters.swift`
  (two), `CaptureLifetime` (seen in LAB-751). The existing `AudioGate` and
  `WriteGate` test helpers can hold a reader for a stalled-consumer test.
- A monologue with no endpoint stays one growing transcript entry (LAB-749).
- The panel logs Reading state several times per 10 ms during speech, so
  log volume grows with speech.

## Open points

- Whether `AVAudioEngine` manual rendering fires an input-node tap, which
  would let tier 1 drive the real engine faster than real time. A short
  spike settles it; until then tier 1 calls `NativeTap.deliver` directly.
- How to measure retained objects cheaply in Swift tests: weak references
  on known types, or the process footprint from `task_info` at the two
  checkpoints. Stack depth via `Thread.callStackReturnAddresses` is proven;
  `callStackSymbols` is too slow for CI.
- Whether BlackHole and a call app can run on the self-hosted Mac runner
  unattended, or tier 4 stays manual.

## Reproduce before fixing

Tag `audelin-before-crash-fixes` marks trunk before the LAB-751 fix. A new
endurance test for a known crash first fails on that tag, then passes on
the fix. For the microphone count test, run it on the tag to see the stack
depth grow, then on trunk to see it stay flat.

## Proposed sub-issues

1. Tier 0: source checks for `Mutex` holding a closure and for streams on
   the capture path without an explicit buffering policy.
2. Tier 1: count tests for the microphone and call-audio adapters at their
   lowest seams, plus one per flow that accumulates (Live text,
   transcript writing, track file), with a shared slope-assertion helper.
3. Tier 3 (short): stalled-consumer tests for each unbounded stream above;
   fix the ones that grow.
4. Tier 2: a compressed 3-hour call through the composed session with a
   fake recogniser, opt-in, with a summary of growth per audio hour.
5. Tier 2b: unpaced 3-hour replay with the real models (extends the replay
   tool; overlaps LAB-748 follow-up 2).
6. Tier 4: BlackHole overnight soak procedure and its counter summary.
