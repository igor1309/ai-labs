---
date: 2026-10-21
model: claude-opus-5-5
description: "Spec: Audelin v1 — recording, live transcript, recovery, setup and calls list"
---

# Spec: Audelin v1 (LAB-400)

## Goal

Make [ADR-001](adr-001-v1-architecture.md) implementable: the session
lifecycle, call detection and the two controls, the files in a call folder,
recognition windows and the stabilizer, the watermark, the activity gate,
setup and the calls list. The scope is v1 in [mvp.md](mvp.md) § Versions. This spec sets the
mechanics ADR-001 left to it (§ Non-goals).

Audelin cuts its own recognition windows from the recorded audio and calls
FluidAudio's public `AsrManager.transcribe` on each one. It does not use
`SlidingWindowAsrManager`. That manager's public updates do not report the
words it retracts (`droppedPreviousTokens`) or the windows that failed, and
its `finish()` returns plain text. With our own windows, every window has a
known audio range and a failure throws (owner, 2026-10-21; ADR-001
amendment of the same date).

Every value this spec sets that neither the owner nor ADR-001 set is listed
in § Values set by this spec. They are starting points, tuned while
profiling and using the app (owner, 2026-10-21).

## Terms

- **Track:** `me` (microphone, «я») or `them` (system audio, «они»).
- **Session clock:** seconds as `Double` from the session origin. The origin
  is the host time when `start()` began capture (2.3). Every time in this
  spec, and every time stored in a call folder, is session time. A reopened
  session reads its times from the folder, never from the wall clock.
- **Epoch:** an unbroken run of capture on one track, numbered from 1 per
  track. A gap lies between two epochs. An epoch has a start, set by its
  first sample, and an end once it is closed.
- **Written edge:** per track and epoch, `start + frames written / 16000`.
- **Watermark:** per track and epoch, the time up to which all audio is
  accounted for, as committed text or as silence that a successful window
  decoded (ADR-001 decision 4). Only a durable log line moves it.
- **Outstanding audio:** per track and epoch, the range from the watermark
  to the written edge.
- **Window:** one call to the recogniser over a contiguous range of one
  track and epoch.
- **Attempt:** a run of windows over one track and epoch by one recogniser
  instance. It is identified by `AttemptID(session, track, epoch, n)`, where
  `n` counts from 1 per track and epoch within the process.
- **Live tail:** recognised words not yet committed, plus committed words
  whose log append failed (shown as unsaved).

## Public interface

Swift signatures are the contract; names of private helpers are free. All
Core types are `Sendable`, and value types are `Equatable`. Ports are
protocols declared by the Core that needs them (ADR-001 decision 10).

### Domain

```swift
// CallDomain
enum Track: String, Codable, Hashable { case me, them }
struct CallID: Hashable, Codable { let uuid: UUID }

enum AudioStatus: String, Codable { case recording, complete, incomplete, failed }
enum TranscriptStatus: String, Codable { case live, catchingUp = "catching_up", complete, incomplete, off }
struct TimeRange: Codable, Equatable { let track: Track; let epoch: Int; let from: Double; let to: Double }
struct CallMeta: Codable, Equatable {
    let version: Int                 // 1
    let id: CallID
    let start: Date                  // wall clock at the session origin
    var duration: Double             // the sealed duration; 0 while recording
    var app: String?                 // the call app's name (1.3), or nil
    var title: String
    var audio: AudioStatus
    var transcript: TranscriptStatus
    var unrecognised: [TimeRange]    // a cache of outstanding audio (3.7)
    var liveText: Bool               // the «Живой текст» switch at the end of recording (11.4)
    var pinned: Bool
}
enum FolderName {
    static func make(start: Date, title: String, timeZone: TimeZone) -> String
    static func parse(_ folderName: String) -> (date: Date?, title: String)
    static func sanitize(title: String) -> String
}

enum AudelinError: Error, Equatable {
    case busy(Activity)              // refused; names the held activity
    case alreadyStarted, notFound(CallID), revoked
    case storage(String), capture(String), recognition(String), model(String)
}

// TranscriptCore
struct Word: Codable, Equatable { let text: String; let start: Double; let end: Double }
enum Cut: String, Codable { case sentence, pause, forced, epochEnd }
enum Origin: String, Codable { case live, catchUp, reopened }
struct SegmentID: Hashable, Codable { let track: Track; let epoch: Int; let seq: Int }
struct Segment: Codable, Equatable {
    let id: SegmentID
    let start: Double; let end: Double     // first word's start, last word's end
    let text: String                       // words joined by single spaces
    let words: [Word]
    let cut: Cut                           // why the segment ends here
    let origin: Origin
    let late: Bool                         // 4.8
}
struct Frontier: Codable, Equatable {      // durable state of one track and epoch
    let track: Track; let epoch: Int
    let epochStart: Double
    let watermark: Double
    let anchor: [Word]                     // the last ≤ 3 committed words
    let nextSeq: Int
}
struct WindowPlan: Equatable {
    enum Kind: Equatable { case commit, final, preview }
    let track: Track; let epoch: Int
    let from: Double; let to: Double; let kind: Kind
}
enum Windowing {                           // pure: the next window to run (4.2)
    static func next(_ f: Frontier, writtenEdge: Double, epochEnd: Double?,
                     live: Bool, lastPreviewTo: Double?) -> WindowPlan?
}
struct CommitContext: Equatable {
    let origin: Origin
    let now: Double?                       // session clock; nil in a reopened session
    let liveSince: Double                  // when live text could start (4.8)
}
struct LogLine: Codable, Equatable {       // one line of live.jsonl (4.1)
    let track: Track; let epoch: Int
    let watermark: Double
    let segments: [Segment]
}
struct StepOutput: Equatable {
    let line: LogLine?                     // nil for a preview window
    let next: Frontier?                    // the frontier once `line` is durable
    let tail: [Word]
}
enum Stabilizer {                          // pure (ADR-001 decision 7; 4.4)
    static func step(_ f: Frontier, plan: WindowPlan, words: [Word],
                     context: CommitContext) -> StepOutput
}
struct TranscriptState: Equatable {
    let segments: [Segment]                // time order per track and epoch
    let frontiers: [Frontier]              // one per track and epoch
}
enum Transcript {
    static func fold(_ lines: [LogLine], epochs: [EpochRecord]) -> TranscriptState
    static func outstanding(_ s: TranscriptState, epochs: [EpochRecord],
                            edges: [TrackEpoch: Double]) -> [TimeRange]
}
struct TrackEpoch: Hashable { let track: Track; let epoch: Int }

// Audio timeline, from audio/index.jsonl and the .pcm sizes (2.4)
struct EpochRecord: Codable, Equatable {
    let track: Track; let epoch: Int
    let start: Double
    var end: Double?                       // nil while open
    var reason: GapReason?                 // why it ended
}
enum GapReason: String, Codable {
    case stop, sleep, deviceChanged, permissionLost, captureFailed, dropout, writeFailed, crash
}

// Activity gate, shared by LiveSessionCore and CallsCore (ADR-001 decision 11)
enum Activity: Hashable, Codable {
    case recording(CallID), catchUp(CallID), edit(CallID), delete(CallID), move
}
struct Lease: Hashable { let id: UUID; let activity: Activity }
actor ActivityGate {
    func acquire(_ a: Activity) async -> Result<Lease, AudelinError>  // 7.2
    func transfer(_ l: Lease, to a: Activity) -> Lease?               // 7.4
    func release(_ l: Lease)
    func isValid(_ l: Lease) -> Bool
    var revocations: AsyncStream<Lease> { get }    // leases to give up (7.3)
    var changes: AsyncStream<[Activity]> { get }   // held activities, current first
}
```

`FolderName.parse` returns `date == nil` when the timestamp was dropped,
and the whole name as the title (1.5). `MoveProgress(moved: Int, total: Int,
current: String)`. `MoveResult` is `.done` or `.failed(moved: Int, total:
Int, title: String, reason: String)`. `MoveJournal` is the `Codable` shape of
9.5. `ModelStatus` is `.ready(URL)`, `.missing`, `.downloading(Double)` or
`.failed(String)`. `Settings` is in 8.3.

### Ports (declared in LiveSessionCore unless noted)

```swift
protocol AudioCapture {             // adapter: AudioCapture
    // Starts every track it can; throws only when no track started.
    func start() async throws -> (started: Set<Track>, failed: [Track: String],
                                  events: AsyncStream<CaptureEvent>)
    func stop() async               // returns when no more events will come
}
enum CaptureEvent {
    case buffer(Track, samples: [Int16], hostTime: Double)  // mono 16 kHz; host time of the first sample
    case interrupted(Track, InterruptReason)
    case resumed(Track)
}
enum InterruptReason: Equatable { case sleep, deviceChanged, permissionLost, failed(String) }

protocol RecordingWriter {          // adapter: FileCallStore
    func beginEpoch(_ e: EpochRecord, call: CallID, lease: Lease) async throws
    func append(_ samples: [Int16], call: CallID, track: Track, epoch: Int,
                lease: Lease) async throws -> Double        // the new written edge
    func endEpoch(call: CallID, track: Track, epoch: Int, at: Double,
                  reason: GapReason, lease: Lease) async throws
    func seal(call: CallID, duration: Double, lease: Lease) async throws
}
protocol RecordedAudioReader {      // adapter: FileCallStore
    func epochs(_ call: CallID) async throws -> [EpochRecord]
    func writtenEdge(_ call: CallID, track: Track, epoch: Int) async throws -> Double
    func read(_ call: CallID, track: Track, epoch: Int,
              from: Double, to: Double) async throws -> [Int16]
}
protocol Recognizer {               // adapter: FluidAudioASR; one per attempt
    func recognize(_ samples: [Int16], from: Double) async throws -> [Word]  // session time
}
protocol RecognizerFactory { func make() async throws -> Recognizer }
protocol SegmentLog {               // adapter: FileCallStore
    func append(_ line: LogLine, call: CallID, lease: Lease) async throws
    func load(_ call: CallID) async throws -> [LogLine]     // clears a dirty log (4.1)
}
protocol CallStore {                // declared in CallsCore; adapter: FileCallStore
    func create(start: Date, title: String, app: String?, lease: Lease) async throws -> CallID
    func meta(_ id: CallID) async throws -> CallMeta
    func update(_ id: CallID, lease: Lease, _ change: (inout CallMeta) -> Void) async throws
    func list() async throws -> [CallMeta]
    func rename(_ id: CallID, title: String, lease: Lease) async throws
    func repair(_ id: CallID, lease: Lease) async throws    // 3.6
    func trash(_ id: CallID, lease: Lease) async throws
    func move(to folder: URL, lease: Lease,
              progress: @Sendable (MoveProgress) -> Void) async -> MoveResult
    func pendingMove() async -> MoveJournal?                // 9.5
}
protocol ModelProvider {            // declared in SetupCore; adapter: ModelStore
    var status: AsyncStream<ModelStatus> { get }  // current value first, then changes
    func findReusable() async -> URL?
    func download() async                         // progress and failure arrive on `status`
}
protocol CallDetector {             // adapter: CallDetector (ADR-001 decision 10)
    var events: AsyncStream<CallEvent> { get }  // current users first, then changes
}
enum CallEvent: Equatable {
    case micInUse(CallApp)          // a call app started using the microphone
    case micReleased(CallApp)       // it stopped
}
struct CallApp: Hashable, Codable { let bundleID: String; let name: String }
protocol SettingsStore { func load() throws -> Settings?; func save(_ s: Settings) throws }
protocol Clock { var now: Double { get }; func sleep(for seconds: Double) async throws }
protocol HostClock { var now: Double { get } }    // monotonic host time, seconds
```

FileCallStore checks `gate.isValid(lease)`, and that the lease names this
call (or is `.move`), before every write and before each step of a
multi-step write. Otherwise it throws `.revoked` (7.3).

### Session

```swift
actor LiveSession {                    // the serialized owner (ADR-001 decision 1)
    var state: AsyncStream<SessionState> { get }    // current value first
    var panel: AsyncStream<PanelPatch> { get }
    func start(_ trigger: Trigger) async throws   // .busy, .alreadyStarted, .capture
    func stop() async                  // 3.1
    func setLiveText(_ on: Bool) async // 11.4
    func rename(_ title: String) async throws
}
enum Trigger: Equatable { case manual, call(CallApp) }
actor CallWatcher {                    // starts and stops sessions (11.2)
    func run() async                   // consumes CallDetector.events and settings
    func startManually() async throws
    func stopManually() async
}
enum SessionState: Equatable {
    case idle, recording, saving, catchingUp, waitingForModel, paused, closed
}
```

A reopened session (3.7) is a `LiveSession` that starts in `catchingUp`,
with no capture.

## Behavior rules

### 1. Call folder and files

1.1. A call folder is named `yyyy.MM.dd-HHmm <title>`, using the local time
zone at the session origin. If that name exists, the second call gets ` 2`,
the third ` 3`, and so on (mvp.md § Edge cases).

1.2. `FolderName.sanitize` trims whitespace, replaces `/` and `:` with `-`,
removes leading dots and cuts the title to 100 characters. An empty result
becomes `Call`.

1.3. The first title is the call app's name, and `app` is that name. For a
recording the call started, that app is the trigger's (11.2). For a
manual start, it is the call app using the microphone at that moment, if
there is one. Otherwise the title is `Call` and `app` is nil. Calendar
titles are v3 (mvp.md § Call folders).

1.4. Files in a call folder:

```text
meta.json            identity and cached status (1.5)
audio/index.jsonl    epoch records and the seal (2.4)
audio/me-<epoch>-<seq>.pcm
audio/them-<epoch>-<seq>.pcm
live.jsonl           the segment log (4.1)
raw.md               rebuilt from live.jsonl (4.7)
```

1.5. `meta.json` is `CallMeta` as JSON, with ISO 8601 dates and the enums'
raw values. It is written atomically: a temporary file in the same folder,
`fsync`, then `rename`. `title` mirrors the folder name without its
timestamp. A Finder rename wins. When a list or load sees a folder title
that differs from `meta.title`, `meta.title` is updated under `.edit(id)`.
If that lease is refused, the update waits for the next list and the folder
title is shown. If the folder name has no parsable timestamp, the date
comes from `start` (mvp.md § Edge cases).

1.6. A call is found by `id` only (ADR-001 invariant 10). The store keeps an
in-memory map from id to folder. It rebuilds the map on launch, on every
list, and whenever an id is not found at its cached path, by scanning the
calls folder (both folders during a move, 9.5). A folder without a readable
`meta.json` is listed as "Unreadable call" and never written to.

### 2. Recording

2.1. Minimum macOS 14.2, for Core Audio process taps.

- The microphone is captured through `AVAudioEngine`'s input node.
- System audio is captured through a Core Audio process tap: a global
  stereo `CATapDescription` that excludes Audelin's own process. The adapter
  creates the tap (`AudioHardwareCreateProcessTap`), then a private aggregate
  device whose tap list holds it, then an IO proc on that device, and starts
  the device. It tears these down in reverse order on stop or failure.
- Both tracks are converted to mono 16 kHz `Int16` with no gain,
  compression or noise reduction (mvp.md § Technical rules 3).
- Info.plist carries `NSMicrophoneUsageDescription` and
  `NSAudioCaptureUsageDescription`.

2.2. `AudioCapture.start()` starts each track independently. Recording
starts if at least one track started. A track that failed gets no epoch,
and the panel shows "«они» not recorded: <reason>". If both fail,
`start()` throws `.capture`: no call folder is created and the gate lease
is released.

2.3. Time mapping:

- The session origin is `HostClock.now` when `start()` calls
  `AudioCapture.start()`.
- An epoch starts at its first buffer's `hostTime − origin`.
- Within an epoch, a sample's time is `epoch start + frame index / 16000`.
  It comes from the sample count, never from buffer times.
- For each buffer the owner computes
  `drift = (hostTime − origin) − (epoch start + frames received / 16000)`.
  A `drift` over 0.2 s means audio went missing. The epoch then ends at its
  edge with `dropout`, and a new epoch starts at the buffer's time.
- A negative drift (the device clock runs fast) is ignored.

2.4. Files and index:

- `.pcm` files are raw little-endian `Int16`, mono, 16 kHz, with no header.
  A file holds exactly 480 000 frames (30 s, mvp.md § Recording files),
  except the last file of an epoch. `seq` counts from 1 per track and
  epoch, and a file never spans epochs.
- `audio/index.jsonl` holds one JSON object per line:
  `{"e":"epoch","track":"me","epoch":1,"start":0.42}`,
  `{"e":"end","track":"me","epoch":1,"at":312.4,"reason":"sleep"}`, and
  `{"e":"sealed","duration":1834.2}`. Each line is appended with one `write`
  (repeated on a short write), then `fsync`.
- An epoch's frames are the sum of its files' sizes / 2, in `seq` order.
  A read across files maps time to `(seq, byte offset)` through that sum.
  A read outside `[start, written edge]` throws.
- Loading skips a torn last line. Records are keyed: `epoch` and `end` by
  track and epoch, and `sealed` once. A duplicate key keeps the first record.

2.5. The Recorder (in LiveSessionCore) appends what capture delivered at
least every 0.5 s. `append` returns after `write` succeeded, and the
returned edge is then readable. A file is `fsync`ed when it closes: on
rotation, at epoch end and at seal. Recognition reads only up to the
written edge (ADR-001 invariant 8).

2.6. A write error on either track starts the finalization path (3.1) with
reason `writeFailed`. Write errors include a full disk, a missing folder,
permissions and a revoked lease. `meta.audio` becomes `failed`, and the
panel shows "Recording failed: <reason>". Samples that were not written are
never passed to recognition (ADR-001 invariant 18).

2.7. Interruptions. `interrupted(track, reason)` ends that track's epoch at
its written edge with the matching `GapReason`. Then:

| Reason | The owner |
|---|---|
| `sleep` | waits for `resumed`, with no limit; the track is *suspended* |
| `deviceChanged` | reacquires the new default device at once |
| `failed` | retries reacquiring 3 times, 1 s apart; then the track is *ended* |
| `permissionLost` | ends the track; panel: "«я» stopped: permission lost" |

`resumed` starts epoch `n + 1` at its first buffer's time (2.3). When every
track is ended, the session runs the finalization path (3.1) with reason
`captureFailed`. A suspended track is not ended. If both tracks are
suspended, the session stays `recording` until wake or Stop.

2.8. Only one session records at a time: `start(_:)` acquires
`.recording(id)` (7.2). `start(_:)` on a session that is not `idle` throws
`.alreadyStarted`.

### 3. Stop, saving and catch-up

3.1. **Finalization path.** Stop, a write failure and the end of every track
all run this one procedure, once per session; a concurrent `stop()` awaits
the same run.

1. State becomes `saving`; every live attempt is revoked (4.5).
2. `AudioCapture.stop()`.
3. Unless the reason is `writeFailed`, buffered samples are written.
4. Each open epoch is ended at its written edge (`stop`, or the reason), and
   its file is closed with `fsync`.
5. `seal(duration)` writes `sealed`, where `duration` is the largest
   written edge.
6. `meta.audio` is set:
   - `failed` for `writeFailed`;
   - `incomplete` if any epoch ended other than by `stop` or `sleep`;
   - `complete` otherwise.

   In the same write, `meta.liveText` is set from the switch, and
   `meta.unrecognised` from outstanding audio (3.7). `meta.transcript`
   becomes `catching_up`, or `off` when live text is off.
7. With live text on, the lease is transferred from `.recording(id)` to
   `.catchUp(id)` (7.4), and catch-up starts (3.3). With live text off, the
   lease is released and the session is `closed`: the call's text comes
   from the v3 final pass (mvp.md § Controls).

`stop()` returns when step 7 is done or after the 5 s stop limit, whichever
comes first. Past the limit, the list and panel show "Saving…" while steps
2–7 carry on. The recording lease is held until step 7, so a new recording
is refused with `.busy(.recording(id))`: "The previous call is still
saving". If step 5 or 6 throws, `meta.audio` is set to `incomplete` if that
write succeeds, and the session still transfers to catch-up. A crash at
any step is repaired on launch (3.6, 3.7).

3.2. A session in `recording` is listed with "Recording". From `saving` on,
it is listed as a normal call.

3.3. **Catch-up** runs under `.catchUp(id)`. One attempt per track and epoch
runs windows (4.2) over outstanding audio as fast as the recogniser
returns, epochs in time order. When no outstanding audio is left (or only
ranges given up on, 3.5), the session finishes:

- `meta.transcript` becomes `complete`, or `incomplete` if a range was
  given up on (3.5);
- `raw.md` is rebuilt;
- the lease is released, and the session is `closed`.

3.4. **Preemption.** Acquiring `.recording`, `.move` or `.delete(id)` revokes
a conflicting `.catchUp` (7.3). The session then:

1. revokes its attempts;
2. waits for its in-flight log append and its `meta.json` and `raw.md`
   writes;
3. cancels its pending `raw.md` rebuild;
4. releases the lease and becomes `paused`.

Committed lines stay, and outstanding audio stays outstanding. A paused
session re-acquires `.catchUp(id)` when `changes` shows no conflicting
activity, unless the call was deleted.

3.5. **Window failures.**

- A window that throws is retried once, at once.
- A second failure, or a read error, ends the attempt. Live, this counts as
  a stall (5.3).
- In catch-up, the attempt restarts after 5 s. After 3 ended attempts on the
  same track and epoch, the session gives that range up: it stays
  outstanding, `meta.transcript` becomes `incomplete`, and the next launch
  tries again.

3.6. **Launch repair** runs on launch for every call, under `.edit(id)`:

1. Truncate `audio/index.jsonl` and `live.jsonl` after their last newline,
   removing a torn line.
2. Truncate each `.pcm` file to an even byte count.
3. For each epoch with no `end` record, append `end` with reason `crash` at
   its written edge.
4. If there is no `sealed` record, append one with the largest written edge
   and set `meta.audio` to `incomplete`.

Each step checks before it writes, so a repair interrupted and run again
writes nothing twice. Records already written are kept (2.4 keys).

3.7. **Outstanding audio is derived, never trusted from `meta.json`.**
`Transcript.outstanding` computes it from the index, the `.pcm` sizes and
the log frontiers. `meta.unrecognised` and `meta.transcript` are a cache
for the list, rewritten whenever outstanding audio is computed. On launch,
after repair, every call with outstanding audio and `meta.liveText` true
gets a reopened session. A call recorded with live text off keeps its
ranges in `meta.unrecognised` and is not caught up in v1.
Reopened sessions run one at a time, newest call first, and each one
acquires `.catchUp(id)`.

3.8. **No model.** If no live model is ready, the session records without
attempts. The panel says "Recording; live text starts when the model is
ready", and the session watches `ModelProvider.status`. `liveSince` is the
session time from which both the model is ready and live text is on (11.4).
When it is reached, each open epoch starts an attempt at its watermark
(4.5). Catch-up with no model is in
`waitingForModel` and starts on `.ready`.

### 4. Recognition, stabilizer and the segment log

4.1. **Segment log.** `live.jsonl` holds one `LogLine` per line, as JSON:

```json
{"track":"me","epoch":1,"watermark":64.88,"segments":[{"id":{"track":"me","epoch":1,"seq":12},"start":61.04,"end":64.88,"text":"Согласуем OKR на следующий квартал.","words":[{"text":"Согласуем","start":61.04,"end":61.6}],"cut":"sentence","origin":"live","late":false}]}
```

- A line is the unit of commit: its segments and watermark become durable
  together or not at all.
- `append` encodes the line and its newline in memory and writes them at
  the end of the file. It repeats `write` on a short write and then calls
  `fsync`.
- If any of those steps throws, the store truncates the file back to its
  length before the append, marks the log *dirty* and throws. A dirty log
  accepts no appends until `load` runs.
- `load` truncates after the last newline, clears *dirty* and returns the
  lines. A complete line that fails to decode is a store error and is never
  skipped.
- After a failed append, the session reloads the log. If the line is there
  (an `fsync` failure after a successful write), the session takes the
  frontier from it. If not, the commit did not happen.

`Transcript.fold` applies lines in file order. Each line appends its
segments to its track and epoch and sets the frontier:

- `watermark` = the line's watermark;
- `anchor` = the last ≤ 3 words of that track and epoch;
- `nextSeq` = the last `seq` + 1.

A track and epoch with no line has `watermark` = the epoch start,
`anchor = []` and `nextSeq = 1`.

4.2. **Windows.** `Windowing.next` is pure. It uses these terms:

- `F`: the frontier's watermark;
- `es`: the epoch start;
- `E`: the epoch end, if the epoch has ended;
- `edge`: the written edge;
- L = 4 s left context, C = 4 s commit span, R = 4 s right context.

| Kind | When | Range |
|---|---|---|
| none | `F == E` | — |
| commit | `edge ≥ F + C + R` | `[max(es, F − L), F + C + R]` |
| final | the epoch has ended and `E − F ≤ C + R` | `[max(es, F − L), E]` |
| preview | live only; `edge − F ≥ 1 s` and `edge ≥ lastPreviewTo + 2 s` | `[max(es, F − L), edge]` |

The rows are checked in order. A window is at most L + C + R = 12 s long,
under FluidAudio's 15 s single-pass limit (`ASRConstants.maxModelSamples`).
A window shorter than FluidAudio's 0.3 s minimum is padded with zero
samples at the end.

4.3. **FluidAudioASR.** Each attempt gets its own `AsrManager`; all
attempts share one loaded `AsrModels`. Each window calls
`transcribe(samples, decoderState: &fresh)` with a new decoder state and no
language hint, because a Russian hint filters out Latin-script terms. Words
come from `ASRResult.tokenTimings`:

- A token whose text begins with a space starts a new word (FluidAudio has
  already replaced `▁` with a space), and so does the first token.
- Every other token, punctuation included, joins the previous word.
- A word's text is its tokens joined, with the leading space trimmed.
- `start` = first token's `startTime + from`; `end` = last token's
  `endTime + from`.

Empty `tokenTimings` means no words. `recognize` throws what `transcribe`
throws.

4.4. **Stabilizer.step** turns one window's words into at most one log
line. Normalized text means lowercase, with leading and trailing
punctuation stripped. A *boundary* after word `i` is valid when word
`i + 1` is absent or starts at or after word `i`'s end. A *sentence end* is
a word ending in `.`, `?`, `!` or `…`. A *pause* is more than 1.5 s between
a word's end and the next word's start.

1. **Align with the last commit.** For `m` from `min(3, anchor.count)` down
   to 1, look for runs in `words` that meet two conditions:
   - their normalized texts equal the last `m` anchor words';
   - their last word's `end` is within 0.4 s of `anchor.last.end`. That is
     FluidAudio's re-decode jitter allowance of five 80 ms frames.

   Take the first `m` that has runs. Among its runs, take the one whose end
   is closest to `anchor.last.end`, the earlier one on a tie. The *new
   words* are those after it. If no `m` has a run, the new words are those
   whose midpoint `(start + end) / 2` is at or after `F`.
2. **Preview:** the output is `tail` = new words, with no line.
3. **Committable words:** for `final`, all new words. For `commit`, the
   longest prefix of new words that all end at or before `F + C`.
4. **Cut.** For `final`, every committable word commits, and the last
   segment's cut is `epochEnd`. For `commit`, the cut is the first of these
   that exists:
   1. the last valid boundary in the committable words, at or after
      `F + C/2`, that follows a sentence end or precedes a pause (`sentence`
      or `pause`);
   2. the last valid boundary in the committable words (`forced`);
   3. the first valid boundary among the new words (`forced`). The window's
      last word always has one, so every window with new words commits at
      least one word.
5. **Segments.** Committed words split into segments after each sentence
   end and before each pause. Each segment gets a `seq` from `nextSeq`
   upward, plus `origin` and `late` (4.8). It also gets the `cut` that ends
   it: the reason it split, or step 4's cut for the last one.
6. **Watermark.** With `limit` = `F + C` for `commit` or `E` for `final`,
   `c` = the last committed word's end (or `F`) and `t` = the first
   uncommitted new word's start (or `limit`):
   `W = max(F, c, min(limit, t))`. The valid boundary makes `c ≤ t`, so
   `W` passes no tail word. Everything in `[F, W]` is committed text or
   decoded silence. If a `commit` window has no new words, `W = F + C`.
7. **Output.** `line(watermark: W, segments)`, `next` (the frontier once
   that line is durable) and `tail` (the uncommitted new words).

`step` changes no state. The session keeps its frontier and replaces it
with `next` only after `SegmentLog.append` returns (ADR-001 decision 4).

4.5. **Attempts.** While recording, the session runs one attempt per track
and open epoch. During catch-up, it runs one per track and epoch with
outstanding audio. An attempt loops: plan with `Windowing.next`, read,
`recognize`, `step`, append. At most one window per attempt is in flight. A
revoked attempt's results are dropped by `AttemptID`, and its recogniser is
released without waiting (ADR-001 decision 1). A new attempt starts at the
durable frontier, so all of these follow one path:

- a restart;
- model arrival;
- catch-up after Stop or after relaunch;
- resuming after a pause.

The old attempt's tail stays in the panel until the new attempt's first
window returns.

4.6. **Append failure.** If `append` throws and the reloaded log (4.1) does
not hold the line, recognition of that track and epoch pauses. Its
committed words stay in the tail, marked unsaved, and `meta.transcript`
becomes `incomplete`; recording continues. The track retries once a minute
from the durable frontier, and the unsaved words are cleared when the new
attempt's first window returns.

4.7. `raw.md` is rebuilt from the log, debounced to once per 5 s and at
session close, and written atomically:

- One paragraph per run of segments of one track and epoch, in time order,
  joined across a segment that ends with `cut = forced`.
- Each paragraph begins `[mm:ss] «я» ` or `[mm:ss] «они» `, or
  `[hh:mm:ss]` from one hour on.
- A `— gap —` line where an epoch ends other than by `stop`.
- `(late)` after a late segment's text.

4.8. A segment is `late` when any of these holds:

- its origin is `reopened`;
- its `end` is before `liveSince`: audio recorded before the model arrived
  or before live text was switched on (mvp.md § v4 screen details,
  § Controls);
- `now − end > 60 s`, as when catch-up after a stall reaches text a minute
  old.

The last seconds committed by catch-up just after Stop are not late.

### 5. Stalls

5.1. A live attempt is stalled when a `recognize` call has been in flight
for 12 s. It is also stalled when the written edge has stayed at or past
`F + C + R + 4 s` for 12 s without a window returning.

5.2. A stalled attempt is revoked without waiting (4.5). A new attempt, with
a new recogniser, starts at the frontier.

5.3. After 3 stalls or ended attempts (3.5) on one track and epoch within
5 minutes, live recognition of that track pauses for the rest of the epoch.
The panel says "Live text paused for «они»", and catch-up recognises the
range after Stop.

### 6. Panel

6.1. The panel is an `NSPanel` that floats over full-screen apps on all
spaces. It never takes focus from the call app, except while the owner
selects text in it.

6.2. **Blocks.** Each committed segment, each track's live tail and each gap
is a block. Blocks are ordered by `(start, track, kind)`:

- `start` is a segment's start, a tail's first word's start, or a gap's
  epoch end;
- `me` sorts before `them`;
- a segment sorts before a tail, and a tail before a gap.

Adjacent segments of one track and epoch render as one paragraph while the
earlier one ends with `cut = forced`. A paragraph starts with its time and
speaker label, as in the design (audelin/docs/design/README.md).

6.3. **Patches.**

```swift
enum PanelPatch: Equatable {
    case commit(Track, epoch: Int, segments: [Segment], tail: [Word])  // atomic promotion
    case setTail(Track, epoch: Int, words: [Word], unsaved: [Word])
    case gap(Track, epoch: Int, at: Double)
    case status(String?)
    case reset(TranscriptState)       // when the panel opens
}
```

The panel applies each patch to its `NSTextStorage` as one edit. It keeps a
map from block to character range, and within a block from word index to
UTF-16 range.

6.4. **Selection.** An endpoint is stored as (block, word index, UTF-16
offset in the word).

- An edit outside the selected range shifts the range with the text.
- Content inserted inside the selected range, such as a late segment or a
  gap, joins the selection.
- `commit` and `setTail` map the old tail's words to the new words (the
  committed segments, then the new tail) by the longest common subsequence
  of normalized texts.
  - An endpoint whose word maps moves with it and keeps its offset, clamped
    to the word's length if the text changed.
  - If an endpoint's word does not map, the selection is dropped.

6.5. Scrolling follows the end only while the view is at the end. A
selection stops it from following until the selection is cleared.

### 7. Activity gate

7.1. One mutating owner per call; `move` is exclusive.

| Requested ↓ / held → | recording(x) | catchUp(x) | edit(x) | delete(x) | move |
|---|---|---|---|---|---|
| recording(y), new call | refuse | revoke all catch-ups | — | — | refuse |
| catchUp(id) | refuse | refuse if x = id | refuse if x = id | refuse if x = id | refuse |
| edit(id) | refuse if x = id | refuse if x = id | refuse if x = id | refuse if x = id | refuse |
| delete(id) | refuse if x = id | revoke if x = id | refuse if x = id | refuse if x = id | refuse |
| move | refuse | revoke | refuse | refuse | refuse |

"—" means compatible. A refusal returns `.busy(heldActivity)`.

7.2. `acquire` is atomic on the actor. It checks the table, records the
grant and returns. A request that needs revocations first marks the victims
revoked and blocks new grants that conflict with the request. It waits for
every victim's `release` and only then grants. A recording and a move
requested at the same moment are ordered by the actor, so exactly one is
granted.

7.3. Revocation is fenced. Once a lease is revoked, `isValid` returns false,
so FileCallStore refuses that lease's new writes with `.revoked`. The holder
receives the lease on `revocations`. It finishes its in-flight write (one
log line, one `meta.json` rename or one `.pcm` write), cancels pending jobs
and calls `release` within 2 s. If it has not by then, the gate releases the
lease itself, and the fence refuses any later write.

7.4. `transfer(lease, to:)` swaps the activity in one actor step, so there
is no unheld moment. It is allowed only from `.recording(id)` to
`.catchUp(id)`.

7.5. Every writer and its activity:

| Writer | Activity |
|---|---|
| audio, index, seal and `meta.json` while recording or saving | `recording(id)` |
| catch-up commits, `meta.json`, `raw.md` | `catchUp(id)` |
| rename of a call that has a session | routed to the session, under its lease |
| rename of a closed call, Finder-title update, launch repair | `edit(id)` |
| delete | `delete(id)` |
| folder move and its journal | `move` |
| settings and models in `~/.audelin/` | outside the calls folder; no lease |

### 8. Setup and models

8.1. Setup runs on first launch (no settings) and when the launch check
fails. It asks for the calls folder (default `~/Recordings/Audelin`,
created if missing) and the live model. Nothing else is configured in v1.

8.2. The live model is Parakeet TDT v3 (CoreML) at the revision FluidAudio
0.17.7 loads. The app ships a manifest of the model's files with size and
SHA-256. `findReusable` checks FluidAudio's default cache folder and other
apps' known model folders. A folder is reused only if every manifest file
matches it by name, size and SHA-256. Otherwise the model is downloaded
into `~/.audelin/models/` and checked against the manifest.

8.3. Settings live in `~/.audelin/settings.json`, written atomically:
`{"version":1,"callsFolder":"…","liveModel":{"path":"…","source":"reused|downloaded"},"autoRecord":true,"liveText":true}`.
Both switches default to on (mvp.md § Controls).
`Settings` is the matching `Codable` struct.

8.4. The launch check verifies two things: the calls folder exists and is
writable, and the model path holds every manifest file at its manifest
size. A failure opens setup with the reason ("The live model at … is
gone"). It skips SHA-256 to keep launch fast; a corrupt model then shows
up as failed windows (3.5).

8.5. A failed download sets `status` to `.failed(reason)`, and setup offers
Retry. Recording may start while the model downloads or after a failure
(3.8).

### 9. Calls list

9.1. The list shows every call by `start`, newest first, with title,
duration and the audio and transcript status. "Recording", "Saving…",
"Catching up" and "Paused" come from live sessions.

9.2. Rename sanitizes the title (1.2) and renames the folder, keeping its
timestamp. A name clash gets ` 2` (1.1). `meta.title` is updated after the
folder. A call with a session is renamed through the session; any other
call is renamed under `.edit(id)`. A refused lease shows "Busy:
<activity>".

9.3. Delete asks for confirmation, acquires `.delete(id)` (which revokes
that call's catch-up) and moves the whole folder to the macOS Trash.

9.4. Changing the calls folder asks "Move N calls (size)?" and acquires
`.move`. Calls move one at a time: copy into the new folder, verify every
file's size and SHA-256, then delete the source. A name clash in the target
gets ` 2`.

9.5. **Move journal.** `~/.audelin/move.json` is written atomically before
the first copy and after every step:
`{"from":"…","to":"…","calls":[{"id":"…","state":"pending|copied|verified|deleted"}]}`.

- While a journal exists, the store scans both folders.
- An id found in both folders resolves by its state. The copy in `to` wins
  for `verified` or `deleted`; otherwise the copy in `from` wins.
- On a failure, the move stops and reports "Moved 31 of 52. '<title>'
  failed: <reason>." It offers Retry, which continues from the journal.
- On launch, a journal shows the same report with Retry.
- A resumed move deletes a `verified` call's source. For a `copied` or
  `pending` call, it removes the partial target and copies again.
- When every call is `deleted`, the setting switches to `to`, and then the
  journal is removed.
- Until then, Settings shows the old folder with "Some calls are in <to>"
  (mvp.md § v4 screen details).

### 10. Logging

10.1. The composition root wraps every port adapter and every Core's public
API in a logging decorator (ADR-001 decision 10). Each decorator logs the
call name, argument shapes, result shape, error and duration to `os.Logger`,
with subsystem `audelin.Audelin` and the interface name as the category.

10.2. Levels: calls and results at `.debug`, errors at `.error`, and calls
over 1 s at `.info`. Transcript text and audio samples are never logged,
only their counts and times.

### 11. Calls, detection and controls

11.1. **Call detection.** The CallDetector adapter watches Core Audio
process objects (`kAudioHardwarePropertyProcessObjectList`, with
`kAudioProcessPropertyIsRunningInput` and `kAudioProcessPropertyBundleID`
on each; macOS 14.2). A *call app* is:

- Zoom (`us.zoom.xos`);
- Telemost;
- a browser: Safari, Chrome, Arc, Firefox, Edge or Yandex Browser.

The exact bundle ids are a list in the adapter. A helper process (such as
`com.google.Chrome.helper`) counts as its app, by bundle-id prefix.
Audelin's own process is never a call app. The adapter emits
`micInUse(app)` when an app's input starts running and `micReleased(app)`
when it stops. A browser counts whenever it uses the microphone, so web
dictation counts too (mvp.md § Controls).

11.2. **CallWatcher** starts and stops sessions while
«Записывать звонки автоматически» (`autoRecord`) is on:

- **Start.** On `micInUse(app)` with no session recording, it calls
  `start(.call(app))`. If the gate refuses, as during a folder move or
  while the previous call is saving, the menu shows "Call not recorded:
  <reason>". The watcher tries again when `changes` frees the gate while a
  call app still uses the microphone.
- **End.** A call ends when no call app has used the microphone for 30 s.
  The watcher then stops a session that it started. A call app taking the
  microphone within those 30 s cancels the pending stop.
- **Manual sessions.** A session started by hand is stopped by hand only,
  and call ends do not stop it. `micInUse` during a manual recording does
  nothing.
- **Manual stop.** Stopping an automatic recording by hand stands: the
  watcher does not restart it while the same call goes on. The next
  `micInUse` after every call app has released the microphone starts a new
  recording.
- **Switch changes.** Turning `autoRecord` off does not stop a session it
  started; that session still stops when the call ends. With `autoRecord`
  off, the watcher starts nothing, and detection is used only for the title
  (1.3).

After a recording stops on its own, the panel keeps its text until the next
recording starts (mvp.md § Controls).

11.3. **Menu bar.** The menu holds:

- Start or Stop recording;
- «Записывать звонки автоматически» and «Живой текст», as checkmark items;
- Open Calls Folder;
- Settings…;
- Quit.

The icon shows three states, as in design Screen 7: waiting for a call,
recording, and recording without live text. Settings has a row for each
switch (Screen 6).

11.4. **«Живой текст» (`liveText`)** is app-wide and applies to the current
recording at once.

- **Off at start:** the session records without attempts, and the panel
  shows the live-text-off state (Screen 3).
- **Switched off mid-call:** each attempt plans its next window with
  `epochEnd` set to the written edge at that moment. That window is a
  `final` (4.2) and commits all shown text, after which the attempt stops.
  Committed text stays, and later audio is not recognised live.
- **Switched on mid-call:** `liveSince` becomes the current session time
  (3.8). Attempts start at their frontiers and fill in the minutes already
  recorded, marked late (4.8).
- **At Stop:** the switch's value goes to `meta.liveText`, and it decides
  whether catch-up runs (3.1, 3.7).

## Values set by this spec

These are proposals, not owner decisions, and are tuned while profiling
and using the app.

| Value | Set to | Rule |
|---|---|---|
| Recogniser | our own windows on `AsrManager.transcribe` (owner, 2026-10-21) | 4.2, 4.3 |
| Window: left context / commit span / right context | 4 s / 4 s / 4 s | 4.2 |
| Preview windows | when ≥ 1 s is outstanding, at most every 2 s of new audio | 4.2 |
| Preferred cut | at or after `F + C/2` | 4.4 |
| Alignment run / tolerance | up to 3 words / 0.4 s (FluidAudio's 5-frame jitter) | 4.4 |
| Segment cut at a pause | 1.5 s | 4.4 |
| Language hint | none | 4.3 |
| Late segment | reopened, before `liveSince`, or committed > 60 s after its end | 4.8 |
| Stop limit before "Saving…" | 5 s | 3.1 |
| Stall | 12 s in flight, or 12 s with no window while audio waits | 5.1 |
| Live text pauses after | 3 stalls or ended attempts in 5 min | 5.3 |
| Window retry / catch-up restart / give-up | once / after 5 s / after 3 attempts | 3.5 |
| Append-failure retry | once a minute | 4.6 |
| Dropout that starts a new epoch | drift > 0.2 s | 2.3 |
| Recorder write interval | 0.5 s | 2.5 |
| `.pcm` file | 480 000 frames; raw `Int16` LE mono 16 kHz | 2.4 |
| Durability | `fsync` per index line, log line and closed `.pcm`; atomic rename for JSON files | 2.4, 2.5, 4.1 |
| `raw.md` rebuild | debounced 5 s, and at close | 4.7 |
| Capture reacquire after a failure | 3 tries, 1 s apart | 2.7 |
| Single-track start | allowed, with a panel notice | 2.2 |
| Revoked holder's release limit | 2 s | 7.3 |
| Reopened sessions | one at a time, newest first | 3.7 |
| Launch check | names and sizes, no SHA-256 | 8.4 |
| Model reuse | full manifest match, SHA-256 included | 8.2 |
| Locations | calls in `~/Recordings/Audelin`; app data in `~/.audelin/` | 8.1, 8.3, 9.5 |
| Minimum macOS | 14.2 (process taps) | 2.1 |
| Title length / first title | 100 characters / the call app's name, else `Call` | 1.2, 1.3 |
| Call apps | Zoom, Telemost; Safari, Chrome, Arc, Firefox, Edge, Yandex Browser (owner named "a browser") | 11.1 |
| Call end | 30 s with no call app on the microphone (owner, mvp.md § Controls) | 11.2 |
| A refused automatic start | retried while the call goes on | 11.2 |
| `autoRecord` off mid-call | the automatic recording still stops at call end | 11.2 |
| Switch-off flush | one `final` window up to the written edge | 11.4 |
| Delete | to the macOS Trash | 9.3 |
| Bundle id and log subsystem / slow call | `audelin.Audelin` / > 1 s logged at `.info` | 10 |
| Word-time check against a full decode | 80 ms (one encoder frame) | test 36 |

## Tests (required)

Pure tests run without audio or a model (ADR-001 invariant 14, as amended).

**Window fixtures** are recorded once from FluidAudioASR, over a recording
the owner makes for the purpose. It holds Russian speech, English terms,
repeated words («да, да»), pauses and a long unbroken sentence. The
recording runs the real windowing and saves each `(plan, words)` as a JSON
line. A second and a third set decode the same audio with every window
shifted by +0.24 s and −0.24 s. A full-file decode of the same audio is the
reference. A fake `Recognizer` returns the recorded words for a plan. The
audio is not committed.

TranscriptCore:

1. Fixture replay logs every reference word once, in time order. Any
   mismatch is at an alignment point and is counted by test 7 (4.4).
2. Alignment drops re-decoded committed words, with the anchor in the
   window's left context (4.4.1).
3. Genuine repeats: «да да» across a commit boundary is logged twice. A word
   that changed at the boundary («показывает» → «показывается») is logged
   once (4.4.1).
4. With no anchor run, the stabilizer falls back to midpoints (4.4.1).
5. Cuts: a sentence end after `F + C/2`, then a pause, then forced. No cut
   splits overlapping words, and the progress rule commits at least one
   word (4.4.4).
6. Watermark: silence gives `W = F + C`, and `W` never passes a tail word
   or decreases and is at or past every committed end. This holds with
   equal timestamps and overlapping word intervals too (4.4.6).
7. On the shifted fixtures, restarting at every frontier logs no word twice
   and loses none. The mismatch count is reported (4.4, 4.5; A5, A9).
8. `final` commits every remaining word, and the last segment's cut is
   `epochEnd` (4.2, 4.4; A4).
9. `Windowing.next`: commit, final and preview plans, the epoch-start
   clamp, `F == E`, and padding under 0.3 s (4.2).
10. `Transcript.fold` and `outstanding`: frontiers, anchors, `nextSeq`, and
    a track and epoch with no line (4.1, 3.7).
11. `late`: a reopened origin, an end before `liveSince`, a live commit at
    59 s and at 61 s after its end, and catch-up right after Stop (4.8).

LiveSessionCore (fakes for every port, manual clocks):

12. A blocked recogniser does not delay `append`. `stop()` returns within
    5 s. With a blocked seal, the session shows "Saving…" and holds the
    recording lease until the seal returns (2.5, 3.1; A3).
13. A stalled attempt is revoked and replaced, and its late results are
    dropped (5.1, 5.2, 4.5; A5).
14. Three stalls pause live text for that track only (5.3).
15. A write error stops capture on both tracks, shows "Recording failed",
    sets `audio = failed` and passes no unwritten audio to recognition
    (2.6, 3.1; A6).
16. Each `interrupted` reason follows 2.7's table. With both tracks
    suspended, the session stays `recording`. Once every track has ended,
    it finalizes. A gap patch is sent, and no segment spans the gap (2.7,
    6.3; A7).
17. A drift of +0.3 s starts a new epoch, and −0.3 s does not. Tracks that
    start at different times keep their own epoch starts (2.3).
18. A window failure retries once, and a second failure or a read error
    ends the attempt. In catch-up, three ended attempts leave the range
    outstanding and the transcript `incomplete` (3.5).
19. Append failure, two cases (4.1, 4.6):
    - The write fails and the line is not durable: the track pauses, shows
      its words as unsaved and retries from the old frontier.
    - `fsync` fails after a durable write: the frontier comes from the
      reloaded line.
20. Model arrival mid-call starts attempts at the watermark and sets
    `liveSince`. Catch-up with no model waits in `waitingForModel` (3.8).
21. Stop transfers the lease to catch-up with no unheld moment, and a move
    requested during `saving` is refused (3.1, 7.4).
22. A recording start revokes catch-up: in-flight writes finish, the pending
    `raw.md` rebuild is cancelled, the session is `paused`, and it resumes
    afterwards (3.4, 7.3).
23. A second `start(_:)` throws `.alreadyStarted`, and concurrent `stop()`
    calls share one finalization (2.8, 3.1).
24. Single-track start: with the mic started and the tap failed, recording
    runs with a notice. If both fail, `start()` throws and no folder exists
    (2.2).

Domain and gate:

25. Every cell of the 7.1 table, in both acquisition orders.
26. A recording and a move requested together: exactly one is granted (7.2;
    A8).
27. A revoked holder that has not released within 2 s loses its lease, and
    its late write is refused (7.3).
28. Folder names: clashes, sanitizing and parsing (1.1, 1.2, 1.5).

FileCallStore (temporary folders):

29. A torn last line in `live.jsonl` loads as the lines before it. A failed
    append truncates back and marks the log dirty, and no append goes
    through until a load (4.1).
30. Launch repair covers a torn index line, an odd-length `.pcm`, an open
    epoch and a missing `sealed`. Running it twice writes nothing twice, and
    neither does a crash injected after each of its writes (3.6).
31. Outstanding audio is derived after a crash at each step of 3.1,
    including `audio = complete` with an empty `unrecognised` and a short
    log, and `audio = failed`. The call reopens, and catch-up after relaunch
    logs the rest exactly once (3.7; A5).
32. Reads across file rotations, with 480 000 frames per file and the range
    check. A Finder rename is picked up by id, and a dropped timestamp falls
    back to `start` (2.4, 1.5, 1.6).
33. Move journal: a relaunch after each of copy, verify, delete and the
    settings switch finds every call once, and Retry finishes (9.5).
34. `raw.md` matches the log, with forced-cut joins, gaps and late marks
    (4.7).
35. Every write with a revoked lease, or another call's lease, throws
    `.revoked` (7.3).

Adapters (on this Mac, not in CI):

36. FluidAudioASR groups real 0.17.7 `tokenTimings` into words, including
    punctuation and a word cut at the window start. Word times are within
    80 ms of the full-file decode's times for the same words, and padding
    works under 0.3 s (4.3).
37. AudioCapture: the tap captures a test tone played as system audio.
    Startup failures injected at the tap, the aggregate device and the IO
    proc leave no device behind (2.1, 2.2).
38. ModelStore reuses a folder only on a full manifest match, and a failed
    download reports `.failed` (8.2, 8.5).

Panel (UI tests):

39. A selection survives these (6.4; A2):
    - appends;
    - selected tail words promoted into a segment;
    - a late segment inserted above it, and one inserted inside it.

    A tail replacement that removes a selected word drops the selection.
40. Block order: an earlier «они» tail sits above a later «я» segment. Gaps
    and forced-cut joins render in place (6.2).
41. The call app keeps focus, and scrolling follows only at the end (6.1,
    6.5).

Logging:

42. A decorator logs a call, its result, error and duration, and never
    transcript text (10).

Calls, detection and controls (fake CallDetector, manual clock):

43. `micInUse(zoom)` starts a recording titled `Zoom` with `app = "Zoom"`.
    A manual start while a browser uses the microphone takes the
    browser's name, and with no call app it is `Call` (1.3, 11.2).
44. A start refused during a move shows "Call not recorded" and starts
    once the move ends while the call goes on (11.2).
45. Call end:
    - the session stops 30 s after the last release;
    - a re-take at 29 s cancels the stop;
    - a manual session ignores call ends;
    - a manual stop is not undone until a new call (11.2).
46. With `autoRecord` off, the watcher starts nothing. Turning it off
    mid-call still stops the automatic recording at call end (11.2).
47. Live text off at start: no attempts run, `meta.transcript = off`, no
    catch-up runs and no reopen at launch (11.4, 3.1, 3.7).
48. Live text switched off mid-call commits up to the written edge and then
    stops. Switched on again, it fills from the frontier with late marks
    (11.4, 4.8).
49. Adapter, on this Mac: the detector reports Zoom and a Chrome call
    (through its helper) and excludes Audelin's own capture (11.1).

**Rule → tests:**

| Rule | Tests |
|---|---|
| 1 | 28, 32, 43 |
| 2 | 12, 15–17, 24, 32, 37 |
| 3 | 10, 12, 18, 21–23, 30, 31 |
| 4 | 1–11, 19, 29, 34, 36 |
| 5 | 13, 14 |
| 6 | 39–41 |
| 7 | 21, 22, 25–27, 35 |
| 8 | 38 |
| 9 | 32, 33 |
| 10 | 42 |
| 11 | 43–49 |

**ADR-001 acceptance → tests:**

| Item | Tests |
|---|---|
| A1 capture-to-display delay | measured on a real call (LAB-408) |
| A2 | 39, and by hand |
| A3 | 12 |
| A4 | 8 |
| A5 | 7, 13, 31 |
| A6 | 15 |
| A7 | 16, 40 |
| A8 | 26 |
| A9 | 7 |
| A10 Parakeet v3 on clean Russian speech with RACI, OKR and SLA | on a real call (LAB-408) |

## Done criteria

- The modules match ADR-001's layout and invariants 1–19, as amended.
- The interfaces above exist as written, or this spec is amended first.
- Tests 1–49 pass. The acceptance list is run on a real call and logged in
  `audelin/docs/log.md`.

## Out of scope

v2 explanations, the v3 final pass, summaries, calendar titles, audio
compaction and retention, call detection and echo cancellation (ADR-001 §
Non-goals).
