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
  sat in `TranscriptFailureReport`. A static check catches it where the
  closure type is written; an alias or an inferred type slips past, so the
  count test stays the proof.

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

**Count losses; compare work, not wall time.** Frames in equal frames
written, per track; dropped or concealed frames are counted; stop completes
and the files close. These are exact and do not flake on a slow runner.
Where work matters, assert a ratio inside one run: a hearing late in a long
call against one early in it, states reaching the panel per audio second.
An absolute time budget flakes; a 50× ratio against a bound of 3 does not.

**Every test asserts a number.** A run that only logs memory, time or a
growth summary passes while they explode. Each tier names its counter and
its bound.

**Run the production consumer, and a stalled one.** A rig that leaves a
stream unread grows a backlog the app does not have; a rig that drains a
stream faster than the app hides one the app does have. Drive the real
reader, then hold it and assert what happens behind it.

**Mind what a snapshot carries before dropping it.** Reading retires an
entry's identity only on a snapshot that leaves the entry out, and entry
ids are positions that come back. Keeping only the newest snapshot, or
throttling, turns a new entry into an edit of an old one. An explicit
buffering policy is not a fix by itself: bounded dropping can lose a
transition or recorded audio. Dropping a snapshot equal to the one before
is safe.

**Seed every random schedule.** A load or fault test that varies chunk
sizes, stalls or failure points takes a seed, prints it, and replays from
it.

## Test tiers

| Tier | What it runs | Catches | Runtime | Where |
| --- | --- | --- | --- | --- |
| 0. Static checks | A test that reads the sources | Known bad patterns where written: `Mutex` holding a closure | < 1 s | CI |
| 1. Count tests | Each adapter and flow at its lowest seam, N vs 10·N units, synthetic audio | Per-delivery growth in stack, objects, queues; stop after a long run | seconds each | CI, inside the 120 s bound |
| 2. Compressed call | The composed session from capture seams to transcript files and the panel's reader, synthetic two-track audio fed as fast as it goes, fake recogniser | Text states reaching the panel per audio second and repeats; work per window late vs early; memory with the reader draining; whole tracks and transcript; final flush | 2 min of audio in CI (~2 s); 3 hours opt-in | CI short, opt-in long |
| 2b. Compressed call, real models | The replay tool over a 3-hour looped fixture, unpaced | Recogniser and Live text growth over 3 hours of audio | ~7 min a track at the measured 3.2–3.8% compute/audio | Opt-in |
| 3. Load and faults | Tiers 1–2 with seeded stalls and failures | Unbounded buffers behind a stalled consumer, a slow recogniser, write errors, format change mid-stream, device loss | as tier 1–2 | CI (short), opt-in (long) |
| 4. Real-time soak | The app on a real Mac, 3 hours, BlackHole loopback: a looped speech fixture as the call side and as the mic, counter-only metrics | Real audio threads (the mid-call overflow hit the AVFAudio messenger thread), scheduling, heat, sleep/wake, a real call app | 3 h | Manual, overnight, before a release |

Tier 4 is the only one that needs real time. It runs rarely and only checks
what tiers 0–3 cannot model; a failure there becomes a tier 1–3 test once
its count or fault is known, as LAB-751 did.

## What the first tests found

On trunk after LAB-751, each failing for its reason before any fix and
marked a known issue until its fix lands:

- `ReturningEntryTests`: when the call text falls behind a side, the
  snapshot that leaves out an entry at 00:02 is lost, and the entry whose
  id returns at 00:12 shows in the panel as an edit of the old one, at
  00:02 with the same id. Each entry keeping one identity as it grows
  passes, so a fix giving every update a new id fails.
- `SessionEnduranceTests`: 140 text states per audio second reach the
  panel, against 5 or so word changes. The last entry's end is how far the
  audio has been heard, so every 512- or 1024-frame piece makes a new state,
  silence included. Repeats alone are 610 of 16,887. Every word of both
  sides reaches the panel and the transcript once and in order, and the
  panel shows each side's latest word before more audio comes: guards.
- `PanelLoadTests`: a text state costs the panel about 100× as much with
  1,620 entries as with 20 (9 ms against 0.09 ms), since every state maps
  and reduces the whole call. At today's 140 states an audio second that
  is 127% of the main actor; the rate and the cost per state are fixed and
  tested apart.
- `SegmentsScalingTests`: a hearing after 30,000 words (a 3-hour side)
  costs about 70× one after 300 with no word lost; every hearing copies
  and re-cuts the whole call. Over a 90-minute compressed call each 10 minutes took 13 s at the
  start and 167 s at the end, memory flat at 14 MiB.
- `StalledConsumerTests`: a panel that stops reading finds about 2,400
  whole-call text states waiting after 20 s and 8,000 after 60 s, where
  the newest would do; it then shows every word. A stalled recogniser holds
  neither the recording, which keeps writing while it is held, nor any
  words: a guard, passing.
- `ParakeetLongCallTests`: a word crossing a chunk's edge is lost when the
  next window places it a little earlier, before that chunk: 6 words of
  1,831 in 20 minutes, as a model of the same timings predicts, when word
  times move up to 40 ms between windows. That real Parakeet times move
  so is likely but not yet measured. No word is heard twice and no
  misheard reading survives.
- `LongCallFaultTests`: a transcript whose disk is full adds a failure for
  every write it tries, about 6,900 in one minute of audio, each copied
  into every session state after it. Recording goes on whole.
- The rig never read the text stream the panel reads, and its unread
  snapshots reached 8 GB in 30 minutes: a rig artefact, not an app leak,
  and the reason for the production-consumer rule above.

Guards, passing on trunk:

- A recogniser failing mid-call ended Live text for both sides
  (`CallText` abandoned the other side); the panel showed the failure, the
  recording went on whole, and the transcript kept every word until then.
- Both capture paths deliver every sample in order (each carries its
  index), so lost, repeated or replaced buffers fail, not only short ones.

- The microphone's 200th buffer reaches the capture no deeper in the
  audio thread's stack than the first. On the tag before the LAB-751 fix it
  is 21 KB deep against 3 KB, about 90 bytes a buffer, so a 544 KB stack
  overflows after about two minutes of audio. Call audio never grew.
- Twenty captures started and stopped leave none alive, nor, for the
  microphone, their engines.
- Only the microphone binding and the transcript's failure report differ
  between the tag and trunk, so every text finding above holds on the tag.

## Fixed since

- Text flood: the last entry now ends where its last word ends, and the
  session drops a side's state, and the panel's, when it equals the one
  before. The endurance test reads about 800 states with no repeats over
  the same audio, from 140 a second; its two checks now pass.
- Returning ids: side text sees every hearing, so an id live text leaves
  out and later brings back for other words gets a new id there; an
  entry that returns while the call text is behind reads as new, at its
  own time.
- Stalled panel: with identity settled before any state can be skipped,
  the panel's text keeps only the newest listening state and the newest
  one after it, since only a listening state takes entries away. A panel
  stalled for 20 or 60 s finds no more than 10 states waiting, from about
  130 and 400, and then shows every word.
- One side's text failing leaves the other side's going: the panel shows
  the failure, and the other side's words reach the panel and transcript
  to the end of the call.
- A transcript that keeps failing is reported once, and again only after a
  write has succeeded.
- A hearing late in a long call costs about what an early one does: a cut
  decided by settled words alone never moves, so the segments before the
  last such cut are kept as they are and only the words after it are cut
  again. Cutting words as they arrive, drafts revised, ends where cutting
  them all at once does.
- A word crossing a chunk's edge that the next window places a little
  before its chunk is kept: that window's reading replaces the pending one
  when it overlaps it more than any word already kept. The recorded windows had one such word,
  "По" in "Три. По SLA", which the expected reading had dropped too; the
  20-minute call now hears all 1,831 words once and in order.

The log now builds only the rows from the first that changed, edits its
text from there, and lays out only the height it shows when the text
fills it. `TranscriptLogLoadTests` holds an update to the newest of 800
or 6,000 entries within 3x one with 20, and a row count shows such an update
builds one row (LAB-771).

Still open (LAB-767): the panel's model cost per update still grows with
the call; `PanelLoadTests` prints it step by step and stays a known issue
until it stops growing.

## Candidates already in the code

- Streams created without a buffering policy (unbounded), which grow if
  their reader stalls (`TranscriptWriting.updates` and `CallText.updates`
  carry the whole call's entries per snapshot): `LiveAudio.swift` (output),
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

1. Tier 0: a source check for `Mutex` holding a closure.
2. Tier 1: count tests for the microphone and call-audio adapters at their
   lowest seams, plus one per flow that accumulates (Live text,
   transcript writing, track file), with a shared slope-assertion helper.
3. Tier 3 (short): stalled-consumer tests for each unbounded stream above;
   fix the ones that grow.
4. Tier 2: a compressed call through the composed session with a fake
   recogniser and the panel's reader, asserting states per audio second,
   repeats and late-vs-early work; 2 minutes in CI, 3 hours opt-in.
5. Tier 2b: unpaced 3-hour replay with the real models (extends the replay
   tool; overlaps LAB-748 follow-up 2).
6. Tier 4: BlackHole overnight soak procedure and its counter summary.
