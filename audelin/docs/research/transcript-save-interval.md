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

Measured 2026-10-31 on branch `audelin-lab817` with `audelin-replay`'s
`saves.md` (Parakeet, the app's live recogniser), on the two longest
recorded Zoom calls with speech, 554 s each:

```sh
cd audelin/docs/research/replay && swift build -c release
.build/release/audelin-replay /tmp/lab817-replay/<call> \
  ~/Recordings/Audelin/<call>/microphone.caf ~/Recordings/Audelin/<call>/call.caf --only parakeet
```

| Call | Side | Text changes per minute | Not yet final, s, median / p90 / max | Text after final, bytes, median / p90 / max |
|---|---|---|---|---|
| 2026.10.29-1608-2 Zoom | microphone | 3 | 12.2 / 124 / 140 | 10 / 44 / 89 |
| 2026.10.29-1608-2 Zoom | call | 15 | 20 / 24 / 28 | 260 / 450 / 673 |
| 2026.10.29-1618 Zoom | microphone | 12 | 20 / 28 / 72 | 278 / 480 / 713 |
| 2026.10.29-1618 Zoom | call | 5 | 20 / 28 / 28 | 258 / 548 / 715 |

- **Parakeet changes the text about once per 4-second window while a side
  speaks,** so at most 15 times a minute per side and 17–18 for both sides
  of these calls. Saving on every change would mean about 18 saves a
  minute, not the 220 the fake recogniser gave. The 5-second pause caps it
  at 12; on real calls it is the append, not the pause, that cuts the bytes.
- **Text stays not yet final for about 20 seconds,** 28 at the 90th
  percentile on a speaking side; a side that says little keeps a segment
  open until a pause closes it, up to 140 seconds here.
- **The text after the final entries is under 1 KB** (at most 715 bytes).
  That is all a crash in the middle of a save can lose beyond the last
  5 seconds; final entries are never lost.

A third call, 2026.10.27-1359, has no speech (its transcript is the header
alone) and was left out.

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

**Explained: the benchmark, not the app.** Traced 2026-10-31 by logging each
save's path and bytes in one `ProfileWord paced 6000 30` run: every rewrite
wrote 291 to 586 bytes, and one save replaced the whole 1.5 MB file. Playing
the call to 6,000 lines outruns the 5-second pause, so the first save holding
the played call came after the counting began, and as the first save with
final entries it replaced the file whole. A real call grows from empty, so its
only whole replacement is its first, nearly empty save. `paced` now waits for
that save before counting.

## Recommendation and owner decision

The source survey does not identify a common industry timer: the observed designs checkpoint final segments or write after transcription. Cost arithmetic alone favors 30 seconds, while the requested crash-loss target favors 1 second; 5 seconds is a compromise, not a measured recogniser optimum. **Recommendation: keep 5 seconds as the provisional interval only if the owner accepts the combined pending-text age plus up-to-5-second crash exposure.** The deciding table shows 5 s costs about 584 MB per 3-hour call at the 1,620-line measured rate and gives 12 saves/min, and the real-call measurements above put the text after the final entries at 715 bytes or less. If that exposure is unacceptable, 1 s lowers interval-only loss to 1 s at ≈2.92 GB; if that disk cost is unacceptable, 30 s lowers writes to ≈117 MB at up to 30 s plus pending age. Owner decision required: acceptable maximum crash loss and acceptable transcript bytes per 3-hour call. The 136 KB average is explained above.

## Measurement provenance and limits

- LAB-817 baseline (issue description, measured 2026-10-30): `Benchmarks/Profile/saves.sh` on branch `audelin-lab817`, 60 s per size, fake recogniser at paced rate; 20/1,620/6,000 lines. The branch is not available in the Git refs fetched for this research. The 219 saves/min and 59 MB/min figures above are issue-reported measurements, not rerun here.
- One-save measurement and 136 KB paced average: issue comment on LAB-817, also not rerun here.
- Real recogniser measurements: two recorded Zoom calls of 554 s each, run through `docs/research/replay` with its `saves.md` output (see above).

## Owner decision (2026-10-31)

**5 seconds.** The owner chose it after reading this note and LAB-829's
`transcript-save-safety.md`; recorded in LAB-817.

The cost table above scales the whole-file baseline. Branch `audelin-lab817`
keeps final text on disk and rewrites only the text after it, so it writes
less. Measured there on 2026-10-31 with `Benchmarks/Profile/saves.sh 60`
(fake recogniser, 5 s pause):

| Lines | Saves per minute | Written per minute | Over 3 hours |
|---|---|---|---|
| 20 | 11 | 0.18 MB | about 32 MB |
| 1,620 | 11 | 0.19 MB | about 34 MB |
| 6,000 | 11 | 0.21 MB | about 38 MB |

The same benchmark at 6,000 lines on the base branch `audelin-lab774`, which
replaced the file whole on every save, gave 149 saves and about 449 MB a
minute: the change writes about 2,000 times less.

**CPU did not go up.** The median cost of each 4 seconds at 6,000 lines is
3.0% of one core and 30 M instructions a second, against 4.2% and 51 M on
the base. The 60-second average reads about 40% against 21%, but only
because counting starts after the played call's whole save, while the app
is still working off the call played in 4 seconds; more of that falls in
this branch's window. Over the whole run this branch retires 486 G instructions
against the base's 515 G (`/usr/bin/time -l ProfileWord paced 6000 60`,
two runs each).
