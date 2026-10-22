---
date: 2026-10-22
model: claude-opus-5-5
description: "Stabilizer — QA"
---

# Stabilizer — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `c82026fa0c97947c7027b0bddadc8eaebd546f3a` |
| driven by | deterministic tests feeding windows recorded once from Parakeet v3, with no audio and no model |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A word with full right context commits

- Drive: a recorded window with right context from 6.0 s; its word «привет» ends at 2.1 s.
- Expect: «привет» is in a committed segment with its times.
- Evidence: Missing.

### S-2 A word in the right context stays live

- Drive: the same window's word ending at 6.4 s.
- Expect: that word is in the tail, in no segment.
- Evidence: Missing.

### S-3 A newer reading replaces the tail

- Drive: a recorded pair where «рейси» in the tail is read «RACI» by the next window.
- Expect: the tail reads «RACI».
- Evidence: Missing.

### S-4 Overlapping windows commit a word once

- Drive: two recorded windows overlapping by 2 s over the same words.
- Expect: each word is committed exactly once.
- Evidence: Missing.

### S-5 Commits keep time order

- Drive: a tail word at 5 s not yet committable, then a window that would commit a word at 7 s.
- Expect: no commit at 7 s until the 5 s word commits; then both, 5 s first.
- Evidence: Missing.

### S-6 An epoch's end commits the final reading

- Drive: tail «рейси план»; feed a final window flagged epoch end that reads «RACI план».
- Expect: «RACI план» commits; «рейси» never commits; the tail is empty.
- Evidence: Missing.

### S-7 No sentence across an epoch

- Drive: an epoch ending mid-sentence at 40 s, then a new epoch's words that continue it.
- Expect: the new words form segments of the new epoch; no segment spans 40 s.
- Evidence: Missing.

### S-8 Words before the watermark are dropped

- Drive: «план» committed ending at 29.9 s, watermark at 30 s; recorded readings of a new attempt's window 25–40 s, right context from 38 s, with words at 26 s, 29 s, 32 s and 35 s; then a second run on the readings of the same window shifted by 3 frames, where «план» re-reads ending at 30.05 s and «на» starts at 30.1 s.
- Expect: in both runs the 32 s and 35 s words, and «на» in the second, commit once each; «план» and the 26 s and 29 s words never commit again.
- Evidence: Missing.

### S-9 A failed window

- Drive: words in the tail; report the next window failed.
- Expect: the tail is unchanged; nothing commits.
- Evidence: Missing.

### S-10 The watermark follows commits

- Drive: a window committing words up to 6.0 s, with a tail word from 6.2 s.
- Expect: the watermark is at least 6.0 s and below 6.2 s.
- Evidence: Missing.

### S-11 Silence moves the watermark

- Drive: after S-10's tail commits at 8 s, a window 8–14 s with no words and right context from 12 s.
- Expect: the watermark reaches 12 s; nothing commits.
- Evidence: Missing.

### S-12 Silence after a live tail

- Drive: a tail word from 6.2 s not yet committable; a window 8–14 s with no words.
- Expect: the watermark stays below 6.2 s; nothing commits.
- Evidence: Missing.

### S-13 Committed text stays final

- Drive: «привет» committed at 2.1 s; a later overlapping window reads «привед» there.
- Expect: no new commit for 2.1 s; the committed «привет» is unchanged.
- Evidence: Missing.
