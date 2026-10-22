---
date: 2026-10-22
model: claude-opus-5-5
description: "Setup screen — QA"
---

# Setup screen — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `6dcd0c60c305bd545423a5d19dde4e0c94512dc5` |
| driven by | the user, on a macOS account that has never run Audelin |
| where | the release build on this Mac; a second account for the fresh-Mac rows |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 First launch opens setup

- Drive: a fresh account; open Audelin.
- Expect: setup shows, proposing «~/Recordings/Audelin».
- Evidence: Missing.

### S-2 Choosing another calls folder

- Drive: in setup, choose «~/Calls»; finish setup; record a call and stop it.
- Expect: setup proposes «~/Calls»; after finishing, the folder exists and the first call lands there.
- Evidence: Missing.

### S-3 A live model already on this Mac

- Drive: the account's FluidAudio cache holds the exact Parakeet v3 files; open setup; finish it.
- Expect: setup says the model was found; nothing downloads (no network traffic to the model host); after finishing, Settings shows the model ready.
- Evidence: Missing.

### S-4 A model with the same name but other files

- Drive: place a file under the model's name with other contents; open setup.
- Expect: setup says the model will be downloaded.
- Evidence: Missing.

### S-5 Downloading the live model

- Drive: no model anywhere; start the download.
- Expect: the progress advances to done.
- Evidence: Missing.

### S-6 Finishing setup during the download

- Drive: from S-5, finish setup before the download ends; record a call.
- Expect: the call records; the panel says live text waits for the model.
- Evidence: Missing.

### S-7 A failed download

- Drive: from S-5, cut the network mid-download.
- Expect: setup says the download failed and why; Retry resumes it after the network returns.
- Evidence: Missing.

### S-8 After setup

- Drive: finish setup; quit; open Audelin.
- Expect: no setup; the menu bar item appears.
- Evidence: Missing.

### S-9 The download completes after setup

- Drive: from S-6, stop that call; wait for the download to finish; open Settings.
- Expect: Settings shows the live model ready.
- Evidence: Missing.

### S-10 The download completes while setup is open

- Drive: from S-5, leave setup open until the download ends; finish setup; open Settings.
- Expect: setup shows the model ready and lets the user finish; Settings shows the model ready.
- Evidence: Missing.
