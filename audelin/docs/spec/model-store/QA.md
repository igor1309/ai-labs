---
date: 2026-10-22
model: claude-opus-5-5
description: "Model store — QA"
---

# Model store — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `a9cc8357448ae573a049df404061f96d0963326c` |
| driven by | integration tests of the adapter over temporary folders and a local HTTP server serving model files |
| where | this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 An exact copy

- Drive: place the Parakeet v3 files with the expected sizes and checksums in a temporary cache.
- Expect: those paths, no download.
- Evidence: Missing.

### S-2 A mismatched copy

- Drive: the same names with one file's bytes changed.
- Expect: no usable copy.
- Evidence: Missing.

### S-3 Download progress

- Drive: serve the files from the local server; download.
- Expect: progress events rising to 100 %; the files land in the app's model folder.
- Evidence: Missing.

### S-4 Resuming a download

- Drive: drop the connection at 50 %; download again.
- Expect: the second request asks for the bytes from 50 % on; the result checks whole.
- Evidence: Missing.

### S-5 A broken download

- Drive: serve a file with one byte flipped.
- Expect: not ready, reason checksum mismatch; the file is not used.
- Evidence: Missing.

### S-6 A reused copy removed

- Drive: from S-1, delete the cache files; check.
- Expect: missing.
- Evidence: Missing.

### S-7 A download completes

- Drive: from S-3, look for the model.
- Expect: the app's model folder paths, checked by name, size and checksum.
- Evidence: Missing.

### S-8 A download cut off for good

- Drive: stop the local server at 50 %.
- Expect: the download fails within its timeout with a network reason; the partial file is kept for S-4.
- Evidence: Missing.

### S-9 Its own copy at a later launch

- Drive: from S-7, open a new adapter on the same folders; look for the model.
- Expect: the app's model folder paths, checked; no download.
- Evidence: Missing.

### S-10 Its own copy removed

- Drive: from S-9, delete the app's model folder; check.
- Expect: missing.
- Evidence: Missing.
