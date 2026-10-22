---
date: 2026-10-22
model: claude-opus-5-5
description: "Segment log — QA"
---

# Segment log — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `0b3b695b5580f10be07ae754e0be2649ce13e6ed` |
| driven by | integration tests of the adapter over temporary folders, a small disk image for S-7 |
| where | this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Segments read back in order

- Drive: append 100 fixture segments, one per append; each append writes one entry, a single line holding one segment.
- Expect: 100 segments back, equal and in order.
- Evidence: Missing.

### S-2 The log outlives the app

- Drive: a child process appends the 100 segments and exits; a fresh process opens the folder.
- Expect: the same 100 segments.
- Evidence: Missing.

### S-3 A torn last entry

- Drive: from S-1, truncate the file mid-way through its last line.
- Expect: exactly the first 99 fixture segments; no error.
- Evidence: Missing.

### S-4 Watermarks

- Drive: append segments and watermarks for «я» epoch 1 at 30 s and «они» epoch 2 at 45 s.
- Expect: both watermarks come back with their track and epoch.
- Evidence: Missing.

### S-5 Gaps and marks

- Drive: append a gap on «они» 40–45 s and segments flagged added later.
- Expect: the gap and the flags come back.
- Evidence: Missing.

### S-6 Earlier entries never change

- Drive: hash the file; append 10 more; hash the first part.
- Expect: the first part's hash is unchanged.
- Evidence: Missing.

### S-7 A write that fails

- Drive: fill a disk image; append.
- Expect: a write-failed error; reading gives every earlier segment.
- Evidence: Missing.

### S-8 A commit and its watermark together

- Drive: in a child process, append 3 segments with a watermark at 30 s, killed with `kill -9` at random points 1 000 times; read after each.
- Expect: a first, uninterrupted append reads back in a fresh process with all 3 segments and the 30 s watermark; after every kill, a fresh read gives the 3 segments and the watermark together or none of them.
- Evidence: Missing.

### S-9 A watermark through silence

- Drive: move «они» epoch 1's watermark from 30 s to 60 s with no segment; read in a fresh process.
- Expect: the watermark is 60 s; no segment between 30 s and 60 s.
- Evidence: Missing.

### S-10 Appending after a torn entry

- Drive: from S-3, append 2 segments; read in a fresh process.
- Expect: the 99 whole segments, then the 2 new ones; no error.
- Evidence: Missing.
