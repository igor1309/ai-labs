---
date: 2026-10-22
model: claude-opus-5-5
description: "Live model — QA"
---

# Live model — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `ece5527e24f32b695a2daa4e0ae298e7710ff518` |
| driven by | tests of the live model core through a fake file system holding other apps' model folders and a fake downloader |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 An exact copy on this Mac

- Drive: the fake FluidAudio cache holds the Parakeet v3 files with the expected names, sizes and checksums.
- Expect: ready, pointing at those files; the downloader is never called.
- Evidence: Missing.

### S-2 Same name, other files

- Drive: a file under the model's name with another size and checksum.
- Expect: not ready; a download is proposed; the foreign file is untouched.
- Evidence: Missing.

### S-3 Downloading

- Drive: no model; start the download; the fake downloader reports 10 %, 50 %, 90 %.
- Expect: the client gets those three progress values in order.
- Evidence: Missing.

### S-4 The download completes

- Drive: from S-3, the downloader finishes with verified files.
- Expect: the client gets ready; the files are in the app's own model folder.
- Evidence: Missing.

### S-5 A failed download

- Drive: from S-3 at 50 %, the downloader fails with no network; retry.
- Expect: the client gets the failure with its reason; the retry asks the downloader to resume at 50 %.
- Evidence: Missing.

### S-6 A reused copy disappears

- Drive: from S-1, delete the cache's files; run the check.
- Expect: the model is reported missing.
- Evidence: Missing.

### S-7 Its own copy at a later launch

- Drive: from S-4, open a new core on the same folders.
- Expect: ready, pointing at the app's own model folder; the downloader is not called.
- Evidence: Missing.

### S-8 Its own copy disappears

- Drive: from S-7, delete the app's model folder; run the check.
- Expect: the model is reported missing.
- Evidence: Missing.

### S-9 Watching a running download

- Drive: from S-3 at 50 %, subscribe a second observer; the downloader then reports 90 %.
- Expect: the second observer gets 50 % at once, then 90 %.
- Evidence: Missing.
