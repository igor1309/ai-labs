---
date: 2026-10-21
model: claude-opus-5-5
description: "Spec: Audelin v1 — recording, live transcript, recovery, setup and calls list"
---

# Spec: Audelin v1 (LAB-400)

## Goal

Make [ADR-001](adr-001-v1-architecture.md) implementable: the session
lifecycle, the files in a call folder, the recognition port and the
stabilizer, the watermark and replay, the activity gate, setup and the
calls list. The scope is v1 in [mvp.md](research/mvp.md) § Versions. This
spec sets the mechanics ADR-001 left to it (§ Non-goals) and does not change
its decisions.

Every value this spec sets that neither the owner nor ADR-001 set is listed
in § Values set by this spec. They are starting points, tuned while
profiling and using the app (owner, 2026-10-21).

## Terms

- **Track:** `me` (microphone, «я») or `them` (system audio, «они»).
- **Session clock:** seconds since the session started, as `Double`. Every
  time in this spec is session time unless it says otherwise.
- **Epoch:** an unbroken run of capture on one track. Epochs are numbered
  from 1 per track. A gap lies between two epochs.
- **Written edge:** per track and epoch, the session time up to which audio
  is written to disk and readable.
- **Attempt:** one recognition run over one track and epoch, identified by
  `AttemptID(session, track, epoch, n)`; `n` counts from 1 per track and
  epoch in this process.
- **Live tail:** recognised text not yet committed.
- **Watermark:** per track and epoch, the time up to which all audio is
  accounted for as committed text or silence (ADR-001 decision 4).

## Public interface

Swift signatures are the contract; names of private helpers are free.
All Core types are `Sendable`. Ports are protocols declared by the Core that
needs them (ADR-001 decision 10).

### Domain

```swift
// CallDomain
enum Track: String, Codable { case me, them }
struct CallID: Hashable, Codable { let uuid: UUID }
struct CallMeta: Codable { /* § meta.json */ }
enum FolderName {
    static func make(start: Date, title: String, timeZone: TimeZone) -> String
    static func parseTimestamp(_ folderName: String) -> Date?   // nil if dropped
    static func sanitize(title: String) -> String
}

// TranscriptCore
struct Word: Codable, Equatable { let text: String; let start: Double; let end: Double }
struct RecognitionUpdate: Equatable {
    let words: [Word]          // session time, in order
    let coveredUntil: Double   // new audio this update accounts for ends here
    let confirmsEarlier: Bool  // every word sent before this update is confirmed
    let isFinal: Bool          // the stream finished; nothing more will come
}
struct Segment: Codable, Equatable {
    let track: Track; let epoch: Int; let seq: Int
    let start: Double; let end: Double
    let text: String; let words: [Word]
    let late: Bool
}
struct Stabilizer {             // pure value type, one per track and epoch
    init(track: Track, epoch: Int, watermark: Double, lastCommitted: Word?)
    mutating func apply(_ update: RecognitionUpdate, committedAt now: Double) -> StabilizerOutput
}
struct StabilizerOutput: Equatable {
    let commits: [Segment]     // in time order
    let watermark: Double      // after these commits
    let tail: [Word]           // the live tail after this update
}

struct Watermark: Codable, Equatable { let track: Track; let epoch: Int; let at: Double }
struct AttemptID: Hashable { let session: CallID; let track: Track; let epoch: Int; let n: Int }
struct TranscriptState { let segments: [Segment]; let watermarks: [Watermark] }

// Domain, shared by LiveSessionCore and CallsCore (ADR-001 decision 11)
actor ActivityGate {
    func acquire(_ activity: Activity) -> Lease?          // nil = refused
    func release(_ lease: Lease)
    var changes: AsyncStream<GateState> { get }
}
enum Activity: Equatable { case recording(CallID), catchUp(CallID), move, delete(CallID) }
struct Lease: Hashable { let id: UUID; let activity: Activity }
struct GateState { let held: [Activity] }
```

Other shapes named below: `WrittenEdge(track, epoch, at)`;
`PanelPatch` (6.3); `ModelStatus` = `ready(URL)`, `missing`,
`downloading(Double)`; `Settings` (8.3); `MoveProgress(moved, total,
current)`; `MoveResult` = `done` or `failed(moved, total, title, reason)`.

### Ports (declared in LiveSessionCore unless noted)

```swift
protocol AudioCapture {            // adapter: AudioCapture
    func start() async throws -> AsyncStream<CaptureEvent>
    func stop() async
}
enum CaptureEvent {
    case buffer(Track, samples: [Int16], hostTime: Double)  // mono 16 kHz
    case interrupted(Track, reason: InterruptReason)        // ends the epoch
    case resumed(Track)                                     // starts a new epoch
}
enum InterruptReason { case sleep, deviceChanged, permissionLost, failed(String) }

protocol RecordingWriter {         // adapter: FileCallStore (via Recorder)
    func append(_ samples: [Int16], track: Track, epoch: Int) async throws -> Double // new written edge
    func endEpoch(track: Track, epoch: Int) async throws
    func seal() async throws
}
protocol RecordedAudioReader {     // adapter: FileCallStore
    func read(track: Track, epoch: Int, from: Double, to: Double) async throws -> [Int16]
    func writtenEdge(track: Track, epoch: Int) async -> Double
    var written: AsyncStream<WrittenEdge> { get }   // live sessions only
}
protocol LiveRecognizer {          // adapter: FluidAudioASR
    func start(_ id: AttemptID, epochStart: Double, from: Double) async throws
        -> AsyncThrowingStream<RecognitionUpdate, Error>
    func feed(_ id: AttemptID, _ samples: [Int16]) async
    func finish(_ id: AttemptID) async
    func cancel(_ id: AttemptID) async          // must not wait for the attempt
}
protocol SegmentLog {              // adapter: FileCallStore
    func append(_ commits: [Segment], watermark: Watermark) async throws  // one atomic append
    func load(_ call: CallID) async throws -> TranscriptState
}
protocol CallStore {               // declared in CallsCore; adapter: FileCallStore
    func create(start: Date, title: String) async throws -> CallID
    func meta(_ id: CallID) async throws -> CallMeta
    func update(_ id: CallID, _ change: (inout CallMeta) -> Void) async throws
    func list() async throws -> [CallMeta]
    func rename(_ id: CallID, title: String) async throws
    func trash(_ id: CallID) async throws
    func move(to folder: URL, progress: (MoveProgress) -> Void) async throws -> MoveResult
}
protocol ModelProvider {           // declared in SetupCore; adapter: ModelStore
    func status() async -> ModelStatus     // ready(path) / missing / downloading(fraction)
    func findReusable() async -> URL?
    func download() -> AsyncThrowingStream<Double, Error>
}
protocol SettingsStore { func load() throws -> Settings; func save(_: Settings) throws }
protocol Clock { var now: Double { get }; func sleep(for: Double) async throws }
```

### Session

```swift
actor LiveSession {                 // the serialized owner (ADR-001 decision 1)
    var state: SessionState { get }
    var panel: AsyncStream<PanelPatch> { get }
    func start() async throws        // throws .busy if the gate refuses
    func stop() async                // returns when audio is sealed and the call listed
    func rename(_ title: String) async throws
}
enum SessionState { case recording, recordingFailed(String), catchingUp, closed }
```

## Behavior rules

### 1. Call folder and files

1.1. A call folder is named `yyyy.MM.dd-HHmm <title>` in the local time zone
at start. If that name exists, the second gets ` 2`, the third ` 3`, and so
on (mvp.md § Edge cases).

1.2. `FolderName.sanitize` trims whitespace, replaces `/` and `:` with `-`,
removes leading dots and cuts the title to 100 characters. An empty result
becomes `Call`.

1.3. The first title is `Zoom` when `zoom.us` is running at start, else
`Call`. Calendar titles are v3.

1.4. Files in a call folder:

```text
meta.json            the call's identity and status (1.5)
audio/index.jsonl    append-only: epochs, files and gaps (2.4)
audio/me-<epoch>-<seq>.pcm
audio/them-<epoch>-<seq>.pcm
live.jsonl           append-only segment log (4.1)
raw.md               rebuilt from live.jsonl (4.6)
```

1.5. `meta.json`, written atomically (temporary file, then rename):

```json
{
  "version": 1,
  "id": "UUID",
  "start": "2026-10-21T14:05:00+03:00",
  "duration": 1834.2,
  "app": "Zoom",
  "title": "Zoom",
  "audio": "recording | complete | incomplete | failed",
  "transcript": "live | catching_up | complete | incomplete",
  "unrecognised": [{"track": "them", "epoch": 1, "from": 120.0, "to": 1834.2}],
  "pinned": false
}
```

`title` mirrors the folder name without its timestamp. A Finder rename wins:
on load, the title is re-read from the folder name and `meta.json` is
updated. If the folder name has no parsable timestamp, the date comes from
`start` (mvp.md § Edge cases).

1.6. A call is found by `id` only. The store keeps an in-memory map from id
to folder, rebuilt by scanning the calls folder on launch, on every list,
and whenever an id is not found at its cached path.

### 2. Recording

2.1. Minimum macOS 14.2, for Core Audio process taps. Capture: the microphone through `AVAudioEngine`'s input node; system
audio through a Core Audio process tap (`CATapDescription`, stereo global
tap excluding Audelin's own process). Both are converted to mono 16 kHz
`Int16` with no gain, compression or noise reduction (mvp.md § Technical
rules 3), then sent as `CaptureEvent.buffer`.

2.2. Files: raw little-endian `Int16`, mono, 16 kHz, no header. A file holds
at most 30 s (mvp.md § Recording files); then the next `seq` starts. A file
never spans epochs.

2.3. The Recorder appends what capture delivered at least every 0.5 s. An
`append` returns after `write(2)` succeeded; the returned edge is then
readable and published on `RecordedAudioReader.written`. Each file is
`fsync`ed when it is closed (rotation, epoch end, seal).

2.4. `audio/index.jsonl` gets one line per event, appended with `fsync`:
`{"e":"epoch","track":"me","epoch":1,"start":0.0}`,
`{"e":"file","track":"me","epoch":1,"seq":3,"start":60.0,"frames":480000}`
when a file closes, `{"e":"gap","track":"them","epoch":1,"end":312.4,"reason":"deviceChanged"}`,
and `{"e":"sealed","duration":1834.2}`.

2.5. A write error (disk full, folder gone, permission) on either track
moves the session to `recordingFailed`: capture stops for both tracks, the
panel shows "Recording failed: <reason>", `meta.audio` becomes `failed`, and
the session proceeds as in Stop from 3.2. Samples that were not written are
never passed to recognition (ADR-001 invariant 18).

2.6. `interrupted(track, reason)` ends that track's epoch: the Recorder
closes its file and writes a `gap` line. The session owner then:
`sleep` → waits for `resumed`; `deviceChanged` → reacquires the new default
device at once; `permissionLost` → keeps the other track and shows
"«я»/«они» stopped: permission lost"; `failed` → retries reacquiring 3 times
1 s apart, then continues with the other track. If no track is left, the
session stops as in 3.2. `resumed` starts epoch `n+1` at the current session
time.

2.7. Only one session records at a time. `start()` acquires
`.recording(id)` on the gate; refusal throws `.busy` with the holder.

### 3. Stop and catch-up

3.1. `stop()` does, in order: stop capture; write what is buffered; close and
`fsync` the current files; append `sealed`; set `meta.audio` to `complete`
(or `incomplete` if any epoch ended by failure); release `.recording`. It
returns when this is done or after the 5 s seal limit, whichever is first; on
the limit, `meta.audio` becomes `incomplete`. The call is listed from here.

3.2. After `stop()` returns, each track's current attempt gets `finish()` and
up to 10 s (the stop wait) to deliver its final update. A final update
commits the whole tail (4.3). On the limit the attempt is revoked, its tail
is dropped, and the range after the watermark stays unrecognised.

3.3. Every range after a watermark up to the written edge, per track and
epoch, is recorded in `meta.unrecognised` and `meta.transcript` is
`catching_up`. The session then runs catch-up under `.catchUp(id)`:
attempts over the unrecognised ranges, reading as fast as the recogniser
accepts. When all ranges are recognised, `meta.transcript` becomes
`complete` and the session closes.

3.4. Catch-up is cancelled when the gate is acquired for a recording, a move,
or deleting this call (ADR-001 decision 2). The current attempt is revoked;
committed segments stay; the remaining ranges stay in `meta.unrecognised`.
Catch-up resumes when the gate is free.

3.5. On launch, every call whose `meta.unrecognised` is not empty, or whose
`meta.audio` is `recording` (a crash, 3.6), gets a reopened session that
starts in catch-up. Reopened sessions run one at a time, newest call first.

3.6. Crash repair, on launch, for `meta.audio == recording`: truncate each
track's last `.pcm` file to an even byte count; append its `file` line if
missing; append `gap` lines with reason `crash` for open epochs and a
`sealed` line with the last written time; truncate `live.jsonl` after its
last complete line (4.1); set `meta.audio` to `incomplete`.

3.7. If no live model is ready at start, recording runs without attempts and
the panel says "Recording; live text starts when the model is ready". When
the model becomes ready during the recording, each track starts an attempt
from its watermark (0 on a new call), as in 4.5.

### 4. Recognition, stabilizer and the segment log

4.1. `live.jsonl` lines, each one JSON object:

```json
{"t":"seg","track":"me","epoch":1,"seq":12,"start":61.04,"end":64.88,"text":"Согласуем OKR на следующий квартал.","words":[{"w":"Согласуем","s":61.04,"e":61.6}],"late":false,"attempt":2}
{"t":"wm","track":"me","epoch":1,"at":64.88}
```

One `SegmentLog.append` writes its segment lines and the closing `wm` line
with a single `write(2)` and then `fsync`. On load, a trailing incomplete
line, and any `seg` lines after the last `wm` line of their track and epoch,
are ignored: a commit counts only with its watermark.

4.2. The FluidAudioASR adapter runs one `SlidingWindowAsrManager` per
attempt: 4 s chunks, 2 s left and right context, no language hint, sharing
one loaded `AsrModels` (tests.md runs 3–4). It maps FluidAudio updates to
`RecognitionUpdate`:

- `words`: tokens joined into words at SentencePiece word starts (`▁`); a
  word's `start` is its first token's `startTime`, its `end` the last
  token's `endTime`, both plus the attempt's `from`.
- `coveredUntil`: `from + k × chunk` after the k-th update, capped at the
  audio fed so far. A window FluidAudio fails internally sends no update, so
  this undercounts and never overcounts.
- `confirmsEarlier`: FluidAudio's `isConfirmed`. In 0.17.7 a confirmed
  update promotes all earlier unconfirmed text to confirmed and its own text
  stays unconfirmed (`updateTranscriptionState`), so the flag is about the
  words before it.
- `isFinal`: true for the update after `finish()` completes, which carries
  the words not yet sent and `coveredUntil` = all audio fed.

The chunk length is a setting in debug builds only (mvp.md § Chunk size).

4.3. The stabilizer, per update:

1. Drops words that start before the watermark (replay, 4.5).
2. Edge merge: if the update's first words repeat the tail's last words
   (same text, case-insensitive, after stripping punctuation) and start
   before the tail's last word ends + 0.5 s, the tail's copies are replaced
   by the update's. Two-word and one-word overlaps are checked, longest
   first.
3. Appends the remaining words to the tail.
4. Commits: a word becomes final when it is confirmed (a later update has
   `confirmsEarlier`) and the next update's edge has been merged after it, or
   when `isFinal` (ADR-001 decision 7). Final words from the start of the tail form one
   segment, cut at sentence ends (`.`, `?`, `!`) and at pauses over 1.5 s. A
   segment is committed only when every word before it is committed
   (ADR-001 decision 7).
5. Watermark: if the tail is empty, `max(watermark, coveredUntil)`; else
   `max(watermark, min(coveredUntil, tail.first.start))`. It never decreases
   and is at or past every committed word's end.

4.4. The session appends each non-empty `commits` with its watermark
(4.1). A watermark that moved with no commits is appended alone, at most
once every 5 s per track. If `append` throws, recognition of that track
pauses: the attempt is revoked, its tail stays shown (marked as unsaved),
the range after the watermark goes to `meta.unrecognised` and
`meta.transcript` becomes `incomplete`. Recording is not affected.

4.5. A new attempt (stall restart, model arrival, catch-up) starts reading
at `max(epochStart, watermark − 4 s)` and its stabilizer starts at the
logged watermark and last committed word. Only the current attempt's updates
reach the stabilizer; updates of a revoked `AttemptID` are dropped
(ADR-001 decision 1). If FluidAudio's word times turn out too coarse for 4.3
step 1 (acceptance item A9), this spec is amended before build, as ADR-001
says.

4.6. `raw.md` is rebuilt from `live.jsonl` after each append, debounced to
once per 5 s and at session close, written atomically. Format: one paragraph
per segment in time order, `[mm:ss] «я» text` or `[mm:ss] «они» text`, a
line `— gap —` where an epoch ends, and segments with `late` marked `(late)`.

4.7. A segment is `late` when it was committed more than 60 s after its
`end` (mvp.md § v4 screen details).

### 5. Stalls

5.1. An attempt is stalled when the written edge has been at least
`coveredUntil + chunk + right context` (6 s) for 12 s without an update.

5.2. A stalled attempt is revoked without waiting (`cancel`), and a new one
starts as in 4.5.

5.3. After 3 stalls on the same track and epoch within 5 minutes, live
recognition of that track stops for the rest of the recording. The panel
says "Live text paused for «они»"; the range goes to catch-up after Stop.

### 6. Panel

6.1. The panel is an `NSPanel` that floats over full-screen apps on all
spaces and never takes focus from the call app, except while the owner
selects text in it.

6.2. Content order: committed segments of both tracks by `start`, `me`
first on a tie; then each track's tail, ordered by its first word's start.
Each block is prefixed by its time and speaker as in the design
(audelin/docs/design/README.md).

6.3. The session sends `PanelPatch`es: `insertSegment(id, after: id?)`,
`setTail(track, words)`, `gap(track, at)`, `status(text)`. The panel applies
them to its `NSTextStorage` and keeps a map from segment id and tail to
character range. A patch outside the selected range shifts the selection
with the text. A tail replacement that overlaps the selection keeps it when
the selected words are unchanged and drops it otherwise. Scrolling follows the end only when the view was at the end.

### 7. Activity gate

7.1. `acquire` refuses: `.recording` when `.recording` or `.move` is held;
`.move` when `.recording`, `.move` or any `.delete` is held; `.delete(id)`
when `.recording(id)` or `.move` is held; `.catchUp` when `.recording`,
`.move` or `.delete` of the same call is held. Acquiring `.recording`,
`.move` or `.delete(id)` cancels a conflicting `.catchUp` first (3.4).

7.2. Two acquires at the same moment are ordered by the actor: exactly one
of a recording and a move succeeds.

7.3. Only holders write into the calls folder (ADR-001 invariant 16).

### 8. Setup and models

8.1. Setup runs on first launch and when the launch check fails. It asks for
the calls folder (default `~/Recordings/Audelin`, created if missing) and
the live model. Nothing else is configured in v1.

8.2. The live model is Parakeet TDT v3 (CoreML) at the revision FluidAudio
0.17.7 loads. The app ships a manifest of its files with size and SHA-256.
`findReusable` checks FluidAudio's default cache and other apps' known
model folders; a folder is reused only if every manifest file matches by
name, size and SHA-256. Otherwise the model is downloaded into
`~/.audelin/models/`.

8.3. Settings live in `~/.audelin/settings.json`:
`{"version":1,"callsFolder":"…","liveModel":{"path":"…","source":"reused|downloaded"}}`.

8.4. Launch check: the calls folder exists and is writable; the model path
matches the manifest by name and size (not SHA-256, too slow at launch). A
failure opens setup with the reason ("The live model at … is gone").

8.5. Recording may start while the model downloads (3.7).

### 9. Calls list

9.1. The list shows every call by `start`, newest first, with title,
duration, and `audio`/`transcript` status.

9.2. Rename: the new title is sanitized (1.2); the folder is renamed to keep
its timestamp; a name clash gets ` 2` (1.1); `meta.title` is updated. A
rename during recording or catch-up goes through the session owner.

9.3. Delete asks for confirmation, acquires `.delete(id)`, and moves the
whole folder to the macOS Trash.

9.4. Changing the calls folder asks "Move N calls (size)?" and acquires
`.move`. Calls move one by one: copy, verify every file's size and SHA-256,
then delete the source. A name clash in the target gets ` 2`. On a failure
the move stops, reports "Moved 31 of 52. '<title>' failed: <reason>." and
offers Retry, which continues with the calls not yet moved. The setting
changes only when every call has moved; until then it shows the old folder
with a note that some calls are in the new one (mvp.md § v4 screen details).

### 10. Logging

10.1. The composition root wraps every port adapter and every Core's public
API in a logging decorator (ADR-001 decision 10). Each logs the call name,
argument shapes, result shape, error, and duration to `os.Logger` with
subsystem `audelin.Audelin` and the interface name as category.

10.2. Levels: calls and results `.debug`; errors `.error`; calls over 1 s
`.info`. Transcript text and audio samples are never logged, only their
counts and times.

## Values set by this spec

Proposed, not decided by the owner; tuned while profiling and using the app.

| Value | Set to | Rule |
|---|---|---|
| Stop seal limit | 5 s | 3.1 |
| Stop wait for the final update | 10 s | 3.2 |
| Stall: no update while audio waits | 12 s | 5.1 |
| Stalls before live text pauses | 3 in 5 min | 5.3 |
| Replay context before the watermark | 4 s | 4.5 |
| Edge-merge window | 0.5 s | 4.3 |
| Segment cut at a pause | 1.5 s | 4.3 |
| Late segment | committed > 60 s after its end | 4.7 |
| Recorder write interval | 0.5 s | 2.3 |
| `raw.md` rebuild and idle watermark | every 5 s | 4.4, 4.6 |
| Capture reacquire retries | 3, 1 s apart | 2.6 |
| Title length | 100 characters | 1.2 |
| First title | `Zoom` if running, else `Call` | 1.3 |
| Delete | to the macOS Trash | 9.3 |
| Bundle id and log subsystem | `audelin.Audelin` | 10.1 |

## Tests (required)

Pure tests run without audio or a model (ADR-001 invariant 14). Stabilizer
fixtures are update logs recorded once from FluidAudio over a recording the
owner makes for the purpose, saved as JSON lines of `RecognitionUpdate`;
the audio is not committed.

TranscriptCore (stabilizer):

1. Fixture replay commits every word once, in time order (4.3).
2. A repeated word at a chunk edge is logged once; the later copy wins (4.3.2).
3. Text that arrives only in the final update is committed (4.3.4; A4).
4. A later segment waits while earlier words are in the tail (4.3.4).
5. Silence advances the watermark to `coveredUntil` (4.3.5).
6. The watermark never passes a tail word and never decreases (4.3.5).
7. Replay from `watermark − 4 s` commits nothing before the watermark and
   keeps the new words of a crossing segment (4.5; A5).
8. A segment is cut at a sentence end and at a 1.5 s pause (4.3.4).

LiveSessionCore (fakes for every port, manual clock):

9. A blocked recogniser does not delay `append`; Stop returns within the
   seal limit (2.3, 3.1; A3).
10. A stalled attempt is revoked and replaced; its late updates are dropped
    (5.2, 4.5; A5).
11. Three stalls pause live text for that track only (5.3).
12. A write error stops capture on both tracks, shows "Recording failed" and
    sends no unwritten audio to recognition (2.5; A6).
13. `interrupted` writes a gap; no segment spans it; the stabilizer restarts
    (2.6; A7).
14. Final update within the stop wait commits the tail; past it, the range
    goes to `meta.unrecognised` (3.2).
15. A failed `SegmentLog.append` pauses that track and marks the call
    incomplete; recording continues (4.4).
16. Model arrival mid-call starts attempts from the watermark; their
    segments over 60 s old are `late` (3.7, 4.7).
17. Catch-up is cancelled by a recording start and resumes after (3.4).

Domain and gate:

18. Recording and a move started at once: exactly one succeeds (7.2; A8).
19. Every refusal and cancellation row of 7.1.
20. Folder names, clashes, sanitizing and timestamp parsing (1.1, 1.2, 1.5).

FileCallStore (temp directories):

21. `live.jsonl` with a torn last line or segments after the last watermark
    loads to the previous watermark (4.1).
22. Crash repair truncates an odd-length `.pcm` and writes `gap`/`sealed`
    (3.6).
23. A Finder rename is picked up by id; a dropped timestamp falls back to
    `start` (1.5, 1.6).
24. Move: copy-verify-delete per call; a failure mid-way leaves the rest and
    Retry finishes (9.4).
25. `raw.md` matches `live.jsonl`, with gaps and late marks (4.6).

Adapters (on this Mac, not in CI):

26. FluidAudioASR maps a fixture recording to updates whose word times are
    within 80 ms of the audio and whose `coveredUntil` never exceeds the
    audio fed (4.2; A9).
27. ModelStore reuses a folder only on a full manifest match (8.2).

Panel (UI tests):

28. Selection survives appends, tail replacement and a late segment
    inserted above it (6.3; A2).

Acceptance on a real call (LAB-408), from ADR-001:

- A1 capture-to-display delay through the record-first path, measured;
- A2–A9 as mapped above, A2 also by hand;
- A10 Parakeet v3 on clean Russian speech with RACI, OKR and SLA.

## Done criteria

- The modules match ADR-001's layout and invariants 1–19.
- The interfaces above exist as written, or this spec is amended first.
- Tests 1–28 pass; the acceptance list is run on a real call and logged in
  `audelin/docs/log.md`.

## Out of scope

v2 explanations, v3 final pass, summary, calendar titles, audio compaction
and retention, call detection, echo cancellation (ADR-001 § Non-goals).
