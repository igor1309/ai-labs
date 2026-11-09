# Transcript save safety

Research snapshot: 2026-10-31. This note compares crash behavior and flush
choices for a growing transcript. It does not choose how often to save; LAB-817
owns that. Sources are pinned to the named commits in the app survey.

## Recommendation

For Audelin, keep the complete settled prefix and replace only the mutable tail;
use `fsync` at each save, retain whole-file temporary-write/flush/rename for the
first save and after any write failure, and keep the synchronous work on the
existing dedicated transcript queue. This is a recommendation for recovery
from an app crash, not a claim of power-cut durability: the benchmark below
shows `F_FULLFSYNC` costs about 4.4–5.7 ms median per save on this machine,
while Apple's documentation describes it as a stronger request but not an
absolute guarantee. The unavailable `audelin-lab817` branch means its proposed
append writer and SIGKILL results could not be reviewed; that missing branch
evidence must be supplied before this recommendation is treated as decided.
The acceptable power-loss window remains the owner's choice.

## Comparable apps

“Not found” means no explicit flush, crash-recovery, or live-save claim was
found in the source inspected at the listed commit. A database transaction is
not evidence that an app selected `F_FULLFSYNC`; SQLite's own defaults and
durability depend on journal mode and synchronous settings.

| App | What is written / when | Flush and crash recovery | Pinned source evidence |
|---|---|---|---|
| Amanu | Final `transcript.md` and canonical `transcript.json`; both written atomically after transcription, JSON last. No evidence that the live preview is persisted during recording. | Foundation atomic replacement. Explicit `fsync`/`F_FULLFSYNC` and recovery after a killed write: not found. | [`Transcript.swift`, c5950c5](https://github.com/gsamat/amanu/blob/c5950c5aeaaa2ebac6e744a9021fc1b100a39f1b/Sources/amanu/Transcription/Transcript.swift#L18-L40). |
| MacParakeet | SQLite database via GRDB for saved history; live meeting preview is exposed in the app, but a transcript checkpoint write during recording was not found in this checkout. | Explicit flush selection and crash-recovery behavior: not found. | [`DatabaseManager.swift`, d44acb4](https://github.com/moona3k/macparakeet/blob/d44acb46e66a3e15c51146430bbad120b4bbc3cc/Sources/MacParakeetCore/Database/DatabaseManager.swift#L19-L25); [README database declaration](https://github.com/moona3k/macparakeet/blob/d44acb46e66a3e15c51146430bbad120b4bbc3cc/README.md#L253). |
| Meetily | SQLite transcript records; `save_transcript` uses a transaction and updates/inserts one transcript chunk. Its meeting path also writes transcript segments to the database. | Explicit `fsync`/`F_FULLFSYNC`, settings, and crash-recovery behavior: not found. | [`db.py`, a2cb62e](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/backend/app/db.py#L283-L323); [`main.py`](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/backend/app/main.py#L511-L545). |
| Muesli | SQLite WAL; live transcript segments are appended as checkpoint rows in a SQL transaction, with recovery code reading those checkpoints. | Source sets WAL and commits transactions. No explicit synchronous/fullfsync setting was found; crash guarantees therefore depend on SQLite defaults and runtime configuration. | [`DictationStore.swift`, e1b5211](https://github.com/Muesli-HQ/muesli/blob/e1b52117ffb1ab6980f7266b72d9cb9e706a5afb/native/MuesliNative/Sources/MuesliCore/DictationStore.swift#L3253-L3305), [database setup](https://github.com/Muesli-HQ/muesli/blob/e1b52117ffb1ab6980f7266b72d9cb9e706a5afb/native/MuesliNative/Sources/MuesliCore/DictationStore.swift#L5768-L5781). |
| OpenWhispr | SQLite WAL transcription history, written as a completed transcription row. | No explicit sync mode or app-crash recovery routine found. | [`database.js`, a6de6fc](https://github.com/nilsplum/open-whispr/blob/a6de6fc4acf1e5060e6ba07fac30b2c7b99125ae/src/helpers/database.js#L13-L30), [`saveTranscription`](https://github.com/nilsplum/open-whispr/blob/a6de6fc4acf1e5060e6ba07fac30b2c7b99125ae/src/helpers/database.js#L342-L359). |
| Gristmill | Not found. The Audelin survey names it, but does not identify its repository URL; no source commit could be pinned or inspected. | Not found. | Source repository not identified in [`apps.md`](apps.md#named-in-the-chat-survey-not-tested). |
| StenoAI | Meeting transcript is part of a Markdown report. A helper used for sidecar/report edits writes a same-directory temporary file, calls `fsync`, then replaces the destination; explicit power-loss directory sync is not part of that helper. | That helper makes a stronger durability attempt than plain write, but no live transcript save cadence or whole-report recovery routine was found. `F_FULLFSYNC` not found. | [`config.py`, 4ae6c53](https://github.com/stenolabs/stenoai/blob/4ae6c53975d7221eae6de7afc4658c7770db4dc1/src/config.py#L191-L242); [`speaker_suggestions.py`](https://github.com/stenolabs/stenoai/blob/4ae6c53975d7221eae6de7afc4658c7770db4dc1/src/speaker_suggestions.py#L1012-L1050). |
| VoiceInk | Dictation audio is a temporary WAV overwritten by the next recording; completed text is pasted into the focused app. A persistent transcript store was not found. | Flush and app recovery: not found. | [`README.md`, 4aea13b](https://github.com/Vasallo94/voiceink/blob/4aea13badc1927f3fc85544635909f64157b7e05/README.md#L3-L23). |
| Buzz | SQLite transcript/segment records after transcription; text exports are separately generated. The source examined does not establish continuous live transcript persistence. | Explicit sync mode and recovery from a killed save: not found. | [`transcription_service.py`, 116e19f](https://github.com/chidiwilliams/buzz/blob/116e19f882fb28c4635cc1eeb5289381cb743029/buzz/db/service/transcription_service.py#L52-L68); [`transcription_dao.py`](https://github.com/chidiwilliams/buzz/blob/116e19f882fb28c4635cc1eeb5289381cb743029/buzz/db/dao/transcription_dao.py#L18-L55). |
| Vibe | Source inspected exposes streaming transcription segments from a local server; persistence of those segments during recording was not found. | Flush and recovery: not found. | [`engine.rs`, da8c2ca](https://github.com/thewh1teagle/vibe/blob/da8c2ca53b6c7ff44f7a1314c3be862d466c3427/server/crates/vibe-server/src/engine.rs#L150-L207). |

## Crash behavior of the three designs

Apple documents that a successful `write` reports the number of bytes written;
it is not an atomic multi-step save. `ftruncate` immediately discards bytes
beyond the new length; it is not a transaction with a later `write`. Apple's
`rename(2)` says the destination name will exist even if the system crashes in
the middle of rename. APFS documentation says copy-on-write metadata protects
filesystem updates during a crash or power loss. Neither statement makes
truncate-plus-write atomic, nor guarantees that a drive has persisted file data
just because the OS accepted it. A process kill leaves the kernel running; a
kernel panic or power cut can interrupt filesystem and device-cache work.
Those are different failure models. [write(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/write.2.html), [ftruncate(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/ftruncate.2.html), [rename(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/rename.2.html), [APFS crash protection](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/FAQ/FAQ.html).

| Method × flush | Final text after app crash mid-save | Kernel panic / power cut | Time per save (median / p95) | Comparable writers | Branch review and evidence type |
|---|---|---|---:|---|---|
| Whole replacement × `fsync` | Old complete file until rename; new whole file after rename. Audelin's available SIGKILL test covers both sides of rename. | APFS protects metadata from crash damage and `rename(2)` preserves a destination name across an interrupted rename. File data may still be lost/reordered: Apple warns `fsync` may leave bytes in device cache. | 20 lines: 0.302 / 0.376 ms; 1,620: 0.221 / 0.304 ms; 6,000: 0.274 / 0.349 ms (**measured**) | Amanu uses atomic Markdown/JSON replacements; macOS `NSDocument` safe-saves through temp + replace; StenoAI helper uses temp + `fsync` + replace (**read in source/docs**). | Available `cf26b19` uses this for later snapshots, plain `fsync`; SIGKILL test verifies prior/new complete file (**source + test**). |
| Whole replacement × `F_FULLFSYNC` | Same rename boundary. | Stronger request to flush drive buffers after the temporary file write; not a transaction across a partially completed save. Apple docs conflict: archived macOS `fcntl(2)` lists HFS/FAT/UDF, not APFS; current storage guidance calls iOS fullfsync best-effort. APFS/macOS guarantee not found. | 20: 4.703 / 16.682 ms; 1,620: 5.469 / 6.148 ms; 6,000: 5.694 / 6.466 ms (**measured**) | Same as replacement + `fsync`; no surveyed app's explicit use of `F_FULLFSYNC` found (**source review**). | `F_FULLFSYNC` not in available branch; its use is benchmarked by standalone script, not app code (**measured + source review**). |
| Truncate stable prefix + rewrite tail × `fsync` | Kill after truncate can leave the mutable tail absent/partial; the settled prefix remains if offset is correct. | `fsync` does not make truncate + write atomic and Apple warns about device cache/reordering. | 20: 0.065 / 0.085 ms; 1,620: 0.120 / 0.247 ms; 6,000: 0.074 / 0.105 ms (**measured**) | No exact equivalent found. Muesli checkpoints to SQLite; that is a separate persistence design (**source review**). | SIGKILL result for `audelin-lab817`: not found. Safety statement is inferred from `ftruncate(2)`/`write(2)` (**inferred**). |
| Truncate stable prefix + rewrite tail × `F_FULLFSYNC` | Same app-crash exposure until the whole tail is rewritten; flush cannot undo truncate. | Requests stronger flush of completed writes but cannot make the sequence atomic; APFS fullfsync guarantee unresolved in Apple docs. | 20: 4.507 / 5.274 ms; 1,620: 4.370 / 5.226 ms; 6,000: 4.702 / 8.107 ms (**measured**) | No exact equivalent or explicit fullfsync in surveyed apps found (**source review**). | Target branch and crash test unavailable; behavior inferred from system calls, cost measured by script (**inferred + measured**). |
| Append-only delta log × `fsync` | Complete earlier records remain; last record may be partial. Replay must validate framing and ignore an incomplete record. | Prior records have Apple's weaker `fsync` guarantee; recent records can be lost/reordered after system/power failure. | 20: 0.095 / 0.123 ms; 1,620: 0.169 / 0.201 ms; 6,000: 0.349 / 0.386 ms (**measured**) | Vim keeps a periodic recovery swap and syncs it; this is analogous recovery intent, not the exact log format (**docs**). SQLite WAL is a mature transactional log alternative (**docs**). | No Audelin implementation or test. Crash behavior inferred; timing measured with appended delta bytes (**inferred + measured**). |
| Append-only delta log × `F_FULLFSYNC` | Same partial-last-record case; replay should validate/checksum records. | Requests drive-cache flush for completed records; hardware/FS limits and APFS-specific support remain. | 20: 5.181 / 5.528 ms; 1,620: 4.917 / 5.877 ms; 6,000: 4.833 / 5.547 ms (**measured**) | No surveyed app's explicit fullfsync use found; SQLite supports configuring fullfsync on macOS (**source/docs**). | No Audelin implementation or test; behavior inferred, timing measured (**inferred + measured**). |

Do not sync only the replacement temp file and treat the name change as a
durable commit. The current Audelin writer flushes the temp file and then
renames it, but does not sync its containing directory. See the pinned current
implementation at [TranscriptFile.swift, cf26b19](https://github.com/igor1309/ai-labs/blob/cf26b19aed2625eb7e42301b33ed83dc123e84bf/audelin/macos/Sources/TranscriptFile/TranscriptFile.swift#L76-L87).

## Established writers

- **SQLite:** WAL keeps readers from blocking the writer and appends committed
  changes to a log. SQLite documents that WAL plus `synchronous=FULL` syncs the
  WAL on each transaction commit; `NORMAL` keeps transactions consistent but
  can lose a recent commit on power loss or OS crash while remaining safe from
  corruption. `PRAGMA fullfsync=ON` requests macOS `F_FULLFSYNC`; it is off by
  default. SQLite's atomic-commit notes warn that fullfsync can be profoundly
  slow. [WAL](https://www.sqlite.org/wal.html), [PRAGMA synchronous/fullfsync](https://www.sqlite.org/pragma.html#pragma_fullfsync), [atomic commit](https://www.sqlite.org/atomiccommit.html).
- **macOS `NSDocument`:** autosave is scheduled for crash protection and the
  document architecture uses safe save (write a temporary file, replace the
  destination). The API docs do not promise a particular `fsync` or
  `F_FULLFSYNC` policy. [Autosave API](https://developer.apple.com/documentation/appkit/nsdocument), [safe-save description](https://developer.apple.com/library/archive/documentation/General/Devpedia-CocoaApp-MOSX/DocArchitecture.html).
- **VS Code:** Hot Exit retains unsaved working copies in backup storage and
  restores them when the app restarts. This is a second recovery copy; the docs
  do not specify `fsync`/`F_FULLFSYNC` or power-cut durability. [Hot Exit](https://code.visualstudio.com/docs/editing/codebasics#_hot-exit), [backup tracker source](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/workingCopy/electron-browser/workingCopyBackupTracker.ts).
- **Vim:** periodically writes the changed buffer to a swap file (after 200
  characters or four seconds by default), syncs it, and supports `vim -r` / `:recover`.
  Its docs say disabling swap sync increases the risk of losing work. [Vim recovery](https://vimhelp.org/recover.txt.html).

## Measured flush and save cost

The requested `Benchmarks/Profile/` and branch `audelin-lab817` were not present
in the local checkout or available remote refs. Instead, the included standalone
microbenchmark was run on the local arm64 Mac (Darwin 25.6.0) in the system
temporary directory. It writes synthetic snapshots with 20, 1,620 and 6,000
newline-delimited rows, then measures 15 saves per cell; the table reports
median and p95. `replace` measures temp create + full write + flush + rename;
`truncateTail` measures truncate-to-stable-prefix + 256-byte-or-smaller tail
write + flush; `appendLog` measures appending the raw delta bytes + flush (no
record framing, rotation, or replay cost). These are syscall-level
comparisons, not measurements of Audelin's renderer, audio
pipeline, or the missing branch's implementation. The method data is
[`save-flush-benchmark.swift`](save-flush-benchmark.swift); exact command:

```sh
swift audelin/docs/research/save-flush-benchmark.swift
```

`F_FULLFSYNC` added roughly 4.3–5.4 ms to the median save in this run, while
payload size mattered little compared with the flush. The matrix above gives
the measurements. That time is spent inside the synchronous writer call.
Audelin's current `TranscriptFile` actor has a
dedicated serial dispatch executor specifically to keep blocking file I/O off
the cooperative pool; therefore the call delays that writer and its awaiting
caller, but does not by itself block the panel's main thread. This is a
code-based inference, not a UI latency measurement. [Queue setup at cf26b19](https://github.com/igor1309/ai-labs/blob/cf26b19aed2625eb7e42301b33ed83dc123e84bf/audelin/macos/Sources/TranscriptFile/TranscriptFile.swift#L4-L10).

The specific cost can vary with storage device, file-system state and load.
These short runs cannot establish power-cut survival. Apple's archived
`fsync(2)` manual warns that even successful `fsync` may leave data in drive
cache and permit reorder after system failure. Apple's `F_FULLFSYNC` manual
asks the drive to flush that cache; Apple also says this operation can take
quite a while and some drives may ignore it. The modern Apple “Reducing disk
writes” page describes fullfsync as best-effort and still allows loss on sudden
power loss. Sources disagree in how strongly they phrase the guarantee, so
this note does not treat fullfsync as an absolute guarantee:
[fsync(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/fsync.2.html),
[fcntl(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/fcntl.2.html),
[Reducing disk writes](https://developer.apple.com/documentation/xcode/reducing-disk-writes).

## Branch evidence and decision still needed

At available Audelin commit `cf26b19`, opening a transcript creates and syncs
the initial placeholder directly; later snapshots use whole-file temp-write,
plain `fsync`, and rename. The SIGKILL tests cover pause-before/after rename
and show the prior or next whole transcript respectively. A failed replacement
is reported, and the next call still uses whole-file replacement.
Those results do not test truncation, append logging, kernel panic, or power
loss. The task's required `audelin-lab817` ref was not available
(`git ls-remote --heads origin` listed no matching ref), and there is no
`Benchmarks/Profile/` in this checkout. The owner's chosen write and flush
policy must be recorded in LAB-817 after reviewing the missing branch evidence
and choosing an acceptable maximum power-loss window.
