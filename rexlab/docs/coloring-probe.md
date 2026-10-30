# Editable coloring technical probe

Open `/prototypes/coloring.html` on the RexLab development server. The page
has no game entry and uses the separate IndexedDB database
`rexlab-coloring-probe-1`. It contains no rewards or completion flow.

The original vector Stegosaurus has ten closed regions. The same geometry
supplies clipping, fill selection and protected outlines. Its logical canvas
is 1024 × 768; brush diameters are 8, 20 and 40 logical units. Colors and
sizes use chooser sheets. The painted canvas itself animates; reduced motion
keeps the composition still with a short fade.

Documents contain a schema, geometry version, independent ID, revision and
complete ordered action journal. Fills replace preceding paint in their own
region. Undo removes the final action and advances the revision. No-op
acceptance compares final painted pixels, including protected details, with
one channel unit of tolerance for Canvas source-over rounding, so
initial base paint and outside contacts add no history. History is never
truncated. Preview paint is provisional until pointer release; cancellation,
resize, hiding or losing focus discards it.

Each work has an ordered save queue. A journal and its 256 × 192 PNG thumbnail
share one IndexedDB record and transaction. Only transaction completion
acknowledges durability; an older completion cannot label newer edits saved.
Writes validate the previous document and compare its revision inside the
write transaction to reject another window's changes or an unreadable row.
Failed writes retain memory and the previous durable record. Switching works
keeps unsaved sessions in memory. Force-closing can lose pending edits.
Unreadable rows remain unavailable; read failure is visible and never becomes
an empty collection. No storage reset is offered.

## Acceptance status

- Journal, independent work, pointer ownership and save-order/failure logic
  have deterministic automated coverage, including transaction completion,
  abort, corrupt records, synchronous open failure and retry.
- The Chromium contract probe covers real canvas pixels, no-op actions, all
  brush diameters, clipping, nonoverlapping regions, fill replacement, protected
  details, exact restore, undo/continue, independent journals and thumbnails,
  stale writes, atomic abort and corruption. Its UI checks cover cancellation,
  extra pointers, shared double taps, exact composition animation and six
  viewport sizes in both languages and themes. They passed in desktop Chromium 156.0.8078.4; physical Safari results remain pending.
- Browser verification ran from the unrestricted workspace after the implementation
  sandbox denied Chromium launch. The harness builds in memory and intercepts
  requests without a persistent local service.
- Physical iPad finger acceptance: **NOT PERFORMED**. This technical stage is
  not fully accepted; the next production stage must remain pending.

## Measurements

Measured on desktop macOS with Node v22.23.2, 2026-10-30. These are actual
UTF-8 JSON byte counts for validated deterministic journal fixtures, with IDs
`measure-0` through `measure-49`. They exclude PNGs, IndexedDB key/metadata
and filesystem overhead. They are not a measurement of browser storage use.

| Strokes/work | Points/stroke | Points/work | Works | Journal bytes |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 8 | 80 | 1 | 2,088 |
| 10 | 8 | 80 | 10 | 20,880 |
| 10 | 8 | 80 | 50 | 104,440 |
| 1,000 | 24 | 24,000 | 1 | 488,750 |
| 1,000 | 24 | 24,000 | 10 | 4,887,500 |
| 1,000 | 24 | 24,000 | 50 | 24,437,540 |

Measured desktop Chromium 156.0.8078.4, DPR 1, logical canvas 1024 × 768.
These are single-run synthetic workloads, not iPad or physical-disk usage.
PNG bytes are included in payload; database metadata is excluded. Save time
excludes rendering/encoding; restore time reads and validates all documents.

| Strokes/work | Works | Payload bytes | Save all ms | Restore all ms | Render/work median / p95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 16,324 | 1.0 | 0.2 | 2.6 / 2.6 |
| 10 | 10 | 163,240 | 3.4 | 0.8 | 2.8 / 3.1 |
| 10 | 50 | 816,240 | 12.1 | 2.7 | 2.8 / 3.0 |
| 1000 | 1 | 508,647 | 7.6 | 7.8 | 171.2 / 171.2 |
| 1000 | 10 | 5,086,470 | 67.4 | 85.6 | 169.3 / 170.0 |
| 1000 | 50 | 25,432,390 | 304.9 | 386.4 | 169.5 / 177.3 |

Each light-work PNG was 14,236 bytes; each heavy-work PNG was 19,897 bytes.
A 1,000-stroke replay took about 172 ms on this desktop. This is a measured
production performance concern: commits, no-op detection and thumbnail creation
replay history, potentially several times per action. Incremental rendering or
checkpoint caches that retain the full undo journal need evaluation before
shipping. These timings are not pointer-preview frame times.

Run `node tests/coloringProbe.browser.cjs` from `rexlab/` to perform the real
browser contracts and measurements. CI runs it on the first RexLab shard.
It keeps screenshots and `metrics.json` under `/tmp/lab-801/browser` (override
with `PROBE_OUTPUT`). For each workload and collection size it measures journal
and PNG bytes, total save/read-and-validate/render times, individual save and
render median/p95, and thumbnail encoding time. Save includes opening the
database on its first write. The fixtures retain all 1,000 strokes; each work
uses a separate record. Repeated compositions isolate collection size from
art complexity. Payload bytes exclude IndexedDB overhead and are not quota
or crash-resilience measurements. Browser builds used by the runner stay in
memory; no generated harness files enter the project.

The renderer replays the journal for commits and thumbnail generation and
caches committed paint for brush previews. Its cost grows with history and
region count. The heavy-work measurements show that indexing or caching needs evaluation
before production. Drawing and animation frame-time distributions have not
been measured; no claim of smooth iPad interaction is made. Schema or geometry changes require
an explicit migration; this probe rejects them rather than reinterpreting
old paint. Safari transaction behavior, full-disk quota failure, browser
termination during a transaction and device performance remain unverified.
The automated aborted-write case tests atomicity, not physical power loss.

## Physical iPad checklist — not performed

Record model, iPadOS/Safari versions, portrait/landscape, CSS viewport, DPR,
reduced-motion setting and available storage before the session.

1. Open the isolated page; check RU/EN, light/dark, reachable 60 CSS pixel
   controls and chooser sheets without page scrolling. Repeat on iPhone at
   390 × 844 and 320 × 568, and on its side.
2. Finger-test dots and drags with all three sizes, starting outside,
   leaving/re-entering, narrow plates, tail spikes and silhouette edges.
   Check eye/outline protection, fill replacement and undo back to empty.
   Base-only and no-op contacts must leave initial history empty.
3. Touch a second finger on the canvas and on controls during a stroke.
   Neither may change the stroke or tools. Double-tap once, then compare
   two successive drags. Rotate, background and interrupt an active stroke:
   only completed actions may remain.
4. Create two differently painted works. Close and reopen Safari, compare
   each thumbnail and editable paint, undo a saved action, continue and
   verify the other work remains unchanged. Retry a failed save while
   retaining memory; never accept a pending revision as saved.
5. Animate each work and verify its own painted composition moves together.
   Enable reduced motion and verify a still image/short fade. Observe finger
   latency and missed deliberate taps rather than inferring from desktop.
6. Run the 1/10/50-work and 1,000-stroke workloads on device. Record PNG and
   journal bytes, save/restore/render times, and median/p95 frame times
   during drawing and animation with the measurement method and sample
   count. Attach actual results before accepting the stage or advancing it.
