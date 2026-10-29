# Transcript hitches during live text (LAB-759)

## Method

A real two-track call under Instruments could not be run from a headless agent run, so this is a synthetic, offscreen benchmark of the exact code path one live update takes: `macos/Tests/PanelUITests/TranscriptLogBenchmark.swift`. Run it with `AUDELIN_BENCH=1 swift test --filter TranscriptLogBenchmark`.

- The log holds N entries, both speakers alternating, Russian text with English terms. A selection is active near the top and the log follows live.
- 60 ticks. On each tick the last partial grows by one word; every 8th tick it settles and a new line starts.
- Per tick it measures the `Transcript` (attributed string) build, and the full update: new `rootView`, then `layoutSubtreeIfNeeded`, then `displayIfNeeded`.
- Debug build and an offscreen window, so the absolute numbers are pessimistic. What counts is the ratios and how cost grows with N.
- The 60 Hz frame budget is 16.7 ms. Every update runs on the main thread, so anything above that is a hitch.

## Baseline (before)

| entries (≈ minutes of call) | build median | update+layout+draw median / max |
|---|---|---|
| 50 | 8.3 ms | 13.4 / 16.9 ms |
| 200 | 30.6 ms | 46.2 / 49.9 ms |
| 600 | 89.9 ms | 132.8 / 139.7 ms |
| 1200 | 180.1 ms | 264.1 / 286.0 ms |

Each update costs O(whole transcript). About 70% of that was rebuilding the attributed string. Inside the rebuild, most of the time went to creating an `NSFont` from a descriptor and an `NSParagraphStyle` (which measures "00:00") **for every entry on every update**. From roughly 50 entries on, every partial update hitches; deep into a call, each one takes over 100 ms.

## Cheap win, implemented

`Transcript.Builder` now caches fonts and paragraph styles by key (`Sources/PanelUI/Transcript.swift`). Behaviour is unchanged, and all `TranscriptLogTests` pass.

| entries | build median | update+layout+draw median / max |
|---|---|---|
| 50 | 1.2 ms (×7) | 6.0 / 7.8 ms |
| 200 | 4.4 ms (×7) | 19.8 / 38.8 ms |
| 600 | 12.3 ms (×7) | 53.0 / 65.7 ms |
| 1200 | 24.1 ms (×7.5) | 104.4 / 115.8 ms |

Short calls now fit in a frame. Long ones still hitch because what is left still grows linearly with N.

I also tried skipping `setAttributes` on prefix runs that had not changed. The comparison cost more than it saved (1200 entries: 104 → 135 ms), so I reverted it.

## Lessons from the Swift Forums thread

- Streamed text only grows at the end, so earlier blocks are never re-parsed or re-converted. Only the last block is redone.
- Height is computed directly instead of rendering the whole view to measure it. The author names whole-view measuring as the reason MarkdownUI is slow.
- A plain `NSTextView` fed by appends was by far the best: 1–3 missed frames out of ~820, against hundreds for every SwiftUI-text approach.
- Re-parsing everything off the main thread keeps frames smooth but burns 50–150% CPU. That is the wrong trade for an app that also runs two speech recognisers.

audelin already uses `NSTextView` with TextKit 2, which is the fast family. Its problem is that it **rebuilds and diffs everything on each update** and **lays out the whole document**. The thread's appenders do neither.

## Recommendations (by expected impact)

1. **Incremental storage edits instead of rebuild + diff.** Turn `Lines` changes into entry edits: append a new entry, or replace the last entry's body and pending text. Edit only that range of the storage and keep the untouched `EntryRange`s. This removes the O(N) build, the character-by-character prefix scan, and the `setAttributes` over the whole prefix, which also invalidates layout for the whole document. Late groups and gaps are rare and can fall back to a full rebuild. Expected effect: near-constant cost per update, inside a frame at any length.
2. **Stop laying out the whole document.** `sizeThatFits` and `LogTextView.ruleFrames()` both call `ensureLayout(for: documentRange)`. Once the log is taller than its cap, `sizeThatFits` only needs to know the height is at least the cap. Rules can come from the visible fragments only, or be cached per late group.
3. **Coalesce updates to one per frame.** The mic and system tracks each emit partials. Merging state changes per display frame (or every ~50 ms) caps main-thread work however fast the recognisers emit.
4. **Cache the caret** instead of creating a new `NSImage` attachment on each update, or draw it as an overlay.
5. **Confirm on a real call** with a release build in Instruments (Animation Hitches, Time Profiler, and an `os_signpost` around `updateNSView`). This run could not do that.
