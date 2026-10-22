---
date: 2026-10-22
model: claude-opus-5-5
description: "Recorder — QA"
---

# Recorder — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `ab3237d593ac4a2176590c0d0eb8ae00c8946458` |
| driven by | integration tests of the adapter writing to temporary folders, a small disk image for S-5 |
| where | this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Audio is readable as written

- Drive: write 2 s of a tone to «я»; read at once through the reader.
- Expect: the 2 s read back sample-identical while the file is still open.
- Evidence: Missing.

### S-2 Two tracks

- Drive: write 10 s of 440 Hz to «я» and 1 kHz to «они».
- Expect: each track reads back its own tone only.
- Evidence: Missing.

### S-3 A range of a long recording

- Drive: write 75 s of a known sweep to one track; read 20–70 s.
- Expect: the files on disk hold 30, 30 and 15 s; the range read is sample-identical to the sweep's 20–70 s.
- Evidence: Missing.

### S-4 A crash loses only the last moments

- Drive: in a child process, write 75 s; `kill -9` it at 70 s; open a new reader.
- Expect: the first 60 s read back whole; nothing torn is returned.
- Evidence: Missing.

### S-5 The disk fills

- Drive: write into a 5 MB disk image until it fills; then read the track.
- Expect: a write-failed error naming disk full, with the audio time it happened; the read ends before that time.
- Evidence: Missing.

### S-6 A new epoch

- Drive: write 10 s, start an epoch at 15 s, write 10 s.
- Expect: two files, one per epoch; reading 0–25 s gives epoch 1, a gap from 10 s to 15 s, then epoch 2.
- Evidence: Missing.

### S-7 The folder is renamed

- Drive: write 10 s; rename the folder; write 10 s; read through the reader at the new path.
- Expect: all 20 s read back from the renamed folder.
- Evidence: Missing.

### S-8 The folder vanishes

- Drive: write 10 s; delete the folder; write 1 s; read the track from 0 s.
- Expect: a write-failed error naming the missing folder, with the audio time; nothing is recreated; the read returns none of the failed second.
- Evidence: Missing.

### S-9 Stop

- Drive: write 40 s to both tracks; stop.
- Expect: both tracks read back all 40 s, the last 10 s from the second file.
- Evidence: Missing.
