---
date: 2026-10-22
model: claude-opus-5-5
description: "Live text states — QA"
---

# Live text states — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `c23a86de53442c8d0258115b911a42278f613eab` |
| driven by | the user, through the panel, with Zoom on a second device |
| where | the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Live text waits for the model

- Drive: remove the live model; open the app; tick «Живой текст»; start a recording at once.
- Expect: the panel says the call is recorded and live text waits, with the download's progress advancing.
- Evidence: Missing.

### S-2 The model arrives mid-call

- Drive: continue S-1, talking, until the download completes.
- Expect: live text follows from then on; the minutes before appear filled in.
- Evidence: Missing.

### S-3 Recording without live text

- Drive: untick «Живой текст»; start a recording; use the panel's offer to switch it on.
- Expect: the panel said the call is only recorded; after the switch, live text appears.
- Evidence: Missing.

### S-4 Live text switched off mid-call

- Drive: mid-call, the owner says a marked phrase; untick «Живой текст».
- Expect: the panel says the call is only recorded; the text so far, the marked phrase included, stays.
- Evidence: Missing.

### S-5 Live text switched on mid-call

- Drive: model ready; «Живой текст» unticked; start a recording; the owner says a first marked phrase; after two minutes tick it; say a second marked phrase.
- Expect: the second phrase appears live; the first appears filled in above it.
- Evidence: Missing.

### S-6 Live text switched on while the model downloads

- Drive: remove the live model; open the app; untick «Живой текст»; start a recording; tick it while the model downloads.
- Expect: the panel says the call is recorded and live text waits, with the download's progress advancing.
- Evidence: Missing.
