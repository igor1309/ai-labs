# Transcript save interval: evidence and decision

Research for LAB-828, 2026-10-31. The interval limits how much in-memory transcript can be lost after an app crash or force quit; it also controls write frequency. These measurements count bytes submitted by the app, not physical SSD writes or power-loss durability. **The owner must set acceptable loss and disk use; the evidence below does not make that policy decision.**

## Comparable applications

The sources below were checked at the named repository commit (full SHA). “Not found” means the inspected source did not establish an interval or stop-time write; it is not a claim about every app version or an uninspected persistence path.

| App | Observed transcript persistence | Source and conclusion |
|---|---|---|
| Amanu | Live partials are maintained for the live view. The durable canonical transcript is committed once the transcription job has merged its segments, after recording. No periodic live transcript checkpoint found. | `gsamat/amanu` `c5950c5aeaaa2ebac6e744a9021fc1b100a39f1b`: `Sources/amanu/Transcription/TranscriptionCoordinator.swift:425-437` builds the transcript and calls `TranscriptVersions.commit`; `Sources/amanu/Transcription/Transcript.swift:18-32` writes Markdown then JSON atomically. Stop-time final write: yes. |
| MacParakeet | Live partials are displayed; saved meeting transcript artifact is materialized with the resolved transcription after recording. No periodic checkpoint found in the inspected artifact writer. | `moona3k/macparakeet` `d44acb46e66a3e15c51146430bbad120b4bbc3cc`: `Sources/MacParakeetCore/Services/MeetingRecording/MeetingArtifactStore.swift:373-407` resolves and writes `transcript.json`; `:522-525` uses atomic data write. Stop-time final artifact: yes. |
| Meetily | **Not found.** Repository HEAD resolved to `a2cb62e827da7ef59f65064c97233efb2313878e`; clone/read of the source tree failed in this run, so no write interval or stop write is asserted. |
| Muesli | Completed segments are checkpointed individually to SQLite during recording; partial live tails update the view, while checkpoint entries come from `onChunkTranscribed`. This is per finalized chunk, not a wall-clock timer. Stop behavior for the derived export was not established here. | `Muesli-HQ/muesli` `e1b52117ffb1ab6980f7266b72d9cb9e706a5afb`: `native/MuesliNative/Sources/MuesliNativeApp/MuesliController.swift:7918-7957`; `native/MuesliNative/Sources/MuesliCore/DictationStore.swift:3253-3298` inserts checkpoint rows in a transaction. |
| OpenWhispr | **Not found.** No exact source repository/revision for the app was recorded in `apps.md`. |
| Gristmill | Existing survey says it processes after Stop; transcript write interval and exact source revision **not found**. | `audelin/docs/research/chat-khakhalev-2026-10-21.md` is a chat survey, not source evidence. |
| StenoAI | **Not found.** The survey names the repository, but this run did not obtain source that established transcript persistence timing. |
| VoiceInk | **Not found.** Survey links to vendor site; no verified repository/source revision was available. |
| Buzz (additional) | **Not found.** The survey does not link an exact repository revision and no source write timing was verified. |
| Vibe (additional) | **Not found.** The survey does not link an exact repository revision and no source write timing was verified. |

**Disagreement:** Muesli’s source shows durable in-call checkpoints per completed segment. Amanu and MacParakeet’s inspected paths save a resolved transcript after recognition/recording. These are different persistence designs, not conflicting observations of the same app.

## Recogniser and pending-text measurements

No replay measurements can be reported from this checkout. The replay command is:

```sh
cd audelin/docs/research/replay
swift build -c release
.build/release/audelin-replay /tmp/audelin-replay <recorded-call.m4a> --split
```

Run separately for each model to keep the evidence attributable:

```sh
.build/release/audelin-replay /tmp/audelin-replay <recorded-call.m4a> --split --only parakeet
.build/release/audelin-replay /tmp/audelin-replay <recorded-call.m4a> --split --only nemotron
.build/release/audelin-replay /tmp/audelin-replay <recorded-call.m4a> --split --only two-pass
```

The repo contains no recorded call tracks under `audelin/`. Per `docs/research/replay/README.md`, it writes recogniser segment Markdown, final word TSV, and delay summary, but it does **not** currently count transcript snapshots per minute, pending-text age, or final snapshot byte size. The missing replay input and those counters prevent measuring updates/minute, median/longest unsettled-text duration, and final text bytes. The replay tool needs to be extended to count `LiveText.updates` per side and track pending spans from first shown through settlement, then rerun against owner-approved recorded call tracks.

Source-level cadence clues (not measurements of updates/minute): Parakeet reads a 4-second chunk with 2-second context on each side (`macos/Sources/ParakeetRecognizer/ParakeetRecognizer.swift:26-39,61-70`); Nemotron consumes each audio chunk and holds the last word pending until two decoder chunks pass (`macos/Sources/NemotronRecognizer/NemotronRecognizer.swift:32-34,61-75,77-86`). LiveText publishes after every input audio chunk (`macos/Sources/LiveText/LiveText.swift:48-53`). Since replay feeds 0.1-second chunks, these facts alone do not establish a realistic persisted-update rate.

## Interval cost from the published baseline

These are **calculated**, not separately run. Input is LAB-817’s 2026-10-30 measured baseline at 1,620 lines: 270 KB final file, 219 saves/min, 59 MB written/min. Calculations preserve that benchmark’s rounded units and use `3 h = 180 min`; saves/min is `60 / interval`, bytes/min is `59 MB × candidate saves/min / 219`, and call bytes are bytes/min × 180.

| Interval | Most text lost on app crash / force quit | Disk written in 3 h | Saves/min vs. recogniser updates/min | Comparable-app practice | Evidence |
|---|---:|---:|---|---|---|
| 1 s | At most 1 s **if save cadence is met**; pending finality caveat below | ≈2.92 GB (16.2 MB/min) | 60 saves/min; real recogniser updates/min not measured. If below 60, timer saves may repeat unchanged text. | Source-checked apps range from per-final-segment checkpoints (Muesli) to post-recognition write (Amanu, MacParakeet). | Disk and saves are **inferred** by scaling LAB-817 measured whole-file baseline; loss is **inferred** from interval. |
| 5 s | At most 5 s **if save cadence is met**; pending finality caveat below | ≈584 MB (3.23 MB/min) | 12 saves/min; real recogniser updates/min not measured. | Same observed spread. | Disk and saves **inferred** from measured baseline; loss **inferred** from interval. |
| 30 s | At most 30 s **if save cadence is met**; pending finality caveat below | ≈117 MB (0.54 MB/min) | 2 saves/min; real recogniser updates/min not measured. | Same observed spread. | Disk and saves **inferred** from measured baseline; loss **inferred** from interval. |

The issue’s 3-hour estimates (≈1.5 GB, 290 MB, 50 MB) use the rounded 6,000-line paced baseline of about 220 saves/min and 226 MB/min. This table instead scales the 1,620-line measured row to keep one directly named baseline; values differ slightly due to the source measurements and rounded KB/MB. Neither estimate accounts for actual SSD write amplification.

“Most text lost” needs care: timer interval bounds the time since the latest save, but an audio recogniser can keep displayed text provisional longer than that. If a provisional word is first shown at time t and only becomes final later, it may not be in the durable transcript until finality or a stop-time flush; loss can therefore include the unsettled duration plus the save interval. The pending-age replay measurements requested above are necessary to quantify that bound. The final stop write reduces normal-stop loss to zero after it completes, but does not change the crash/force-quit case.

## The 136 KB paced average

**Open; not explained by the evidence available here.** The parent issue reports a 6,000-line single-save measurement of 16 KB, but ≈136 KB average bytes/save during the paced run. The only benchmark source available is `audelin/macos/Benchmarks/Profile/Sources/ProfileWord/main.swift` at `audelin-lab774` commit `a50c2235e74fae32e4f4e24a12df34c480f7fed4`; its `paced` mode counts inode changes from whole-file temp-and-rename saves. The requested `audelin-lab817` branch, its `Profile/saves.sh` results/trace and implementation are not present in the fetched refs, so this does not establish why the two figures differ. Possible causes such as save timing, final/pending text shape, benchmark workload, and instrumentation must be checked against that branch; none is asserted as the explanation.

## Recommendation and owner decision

The source survey does not identify a common industry timer: the observed designs checkpoint final segments or write after transcription. Cost arithmetic alone favors 30 seconds, while the requested crash-loss target favors 1 second; 5 seconds is a compromise, not a measured recogniser optimum. **Recommendation: keep 5 seconds as the provisional interval only if the owner accepts the combined pending-text age plus up-to-5-second crash exposure.** The deciding table shows 5 s costs about 584 MB per 3-hour call at the 1,620-line measured rate and gives 12 saves/min, but real recogniser cadence and unsettled duration are still unmeasured. If that exposure is unacceptable, 1 s lowers interval-only loss to 1 s at ≈2.92 GB; if that disk cost is unacceptable, 30 s lowers writes to ≈117 MB at up to 30 s plus pending age. Owner decision required: acceptable maximum crash loss and acceptable transcript bytes per 3-hour call. The 136 KB discrepancy remains open.

## Measurement provenance and limits

- LAB-817 baseline (issue description, measured 2026-10-30): `Benchmarks/Profile/saves.sh` on branch `audelin-lab817`, 60 s per size, fake recogniser at paced rate; 20/1,620/6,000 lines. The branch is not available in the Git refs fetched for this research. The 219 saves/min and 59 MB/min figures above are issue-reported measurements, not rerun here.
- One-save measurement and 136 KB paced average: issue comment on LAB-817, also not rerun here.
- Proposed real recogniser command: see §2; cannot run without recorded call tracks, and the current tool needs additional cadence/pending metrics.
- No tests were run; this deliverable is research documentation.

## Owner decision (2026-10-31)

**5 seconds.** The owner chose it after reading this note and LAB-829's
`transcript-save-safety.md`; recorded in LAB-817.

The cost table above scales the whole-file baseline. Branch `audelin-lab817`
keeps final text on disk and rewrites only the text after it, so it writes
less. Measured there with `Benchmarks/Profile/saves.sh 60` (fake recogniser,
5 s pause):

| Lines | Saves per minute | Written per minute | Over 3 hours |
|---|---|---|---|
| 20 | 12 | 0.20 MB | about 36 MB |
| 1,620 | 15 | 0.58 MB | about 104 MB |
| 6,000 | 13 | 1.73 MB | about 311 MB |

Still open: real recogniser cadence and pending-text age (needs recorded
tracks and new replay counters), and the 136 KB paced average.
