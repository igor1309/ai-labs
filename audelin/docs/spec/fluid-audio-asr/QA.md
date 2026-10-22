---
date: 2026-10-22
model: claude-opus-5-5
description: "FluidAudio ASR — QA"
---

# FluidAudio ASR — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `8b562676c66c837ba26d7c07171fbd24cf13da52` |
| driven by | integration tests with the real Parakeet v3 model over recorded fixture audio |
| where | this Mac, the model in the app's model folder |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Words with times

- Drive: a 10 s fixture of the owner reading a known sentence, sent as the window 60–70 s.
- Expect: the sentence's words, each timed within 60–70 s and in order; the reply is stored as a fixture for the stabilizer and transcript tests (ADR-001 invariant 14).
- Evidence: Missing.

### S-2 English terms in Russian speech

- Drive: a fixture of the owner saying «нам нужен RACI и OKR до SLA».
- Expect: «RACI», «OKR» and «SLA» in Latin letters.
- Evidence: Missing.

### S-3 Silence

- Drive: 10 s of digital silence.
- Expect: no words.
- Evidence: Missing.

### S-4 No model

- Drive: point the adapter at an empty model folder; send a window.
- Expect: a not-ready error; no crash.
- Evidence: Missing.

### S-5 Two tracks at once

- Drive: send a «я» fixture and an «они» fixture together.
- Expect: each reply holds only its own fixture's words.
- Evidence: Missing.

### S-6 A failed window

- Drive: send a window whose samples are NaN.
- Expect: a recognition-failed error, not an empty word list; the next good window is recognised.
- Evidence: Missing.
