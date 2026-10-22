---
date: 2026-10-22
model: claude-opus-5-5
description: "Transcript — QA"
---

# Transcript — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `ffb0fd0e0338df894cf1786928146bafb860dc07` |
| driven by | unit tests of the transcript builder over fixture segment logs |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Both sides in time order

- Drive: segments «я» 10–12 s, «я» 0–4 s, «они» 5–9 s, in that order.
- Expect: three paragraphs: «я» at 0 s, «они» at 5 s, «я» at 10 s, each labelled with its side and start time.
- Evidence: Missing.

### S-2 One speaker, one paragraph

- Drive: three «они» segments 0–3, 3–6, 6–9 s.
- Expect: one «они» paragraph holding all three in order.
- Evidence: Missing.

### S-3 A late segment lands in its place

- Drive: text from segments at 0 s and 20 s; add one at 10 s.
- Expect: the 10 s segment sits between them.
- Evidence: Missing.

### S-4 A gap

- Drive: «они» segments at 30 s and 50 s with a gap from 40 s to 45 s.
- Expect: a line «— нет звука звонка с <40 s as clock time> —» between them; the segments are in separate paragraphs.
- Evidence: Missing.

### S-5 Marks

- Drive: segments 0–120 s flagged added later; «я» flagged incomplete from 200 s; 300–360 s marked only recorded.
- Expect: the 0–120 s text carries «дописано позже»; «я» from 200 s carries the incomplete mark; 300–360 s comes as only recorded.
- Evidence: Missing.

### S-6 A patch per change

- Drive: apply each segment of a 600 s fixture log one by one, keeping the patches.
- Expect: after each segment, the text so far with its patch applied equals the text built at once from the segments added so far.
- Evidence: Missing.

### S-7 The same segments, the same text

- Drive: build a fixture log's text through the panel path and the call-screen path.
- Expect: the two texts are byte-identical.
- Evidence: Missing.

### S-8 The live tail

- Drive: text from segments to 20 s; set the tail «план на» at 21 s, then «план на квартал».
- Expect: each patch gives the text then the tail; the second replaces the first tail; in a second run, an «я» tail at 15 s with an «они» segment committed at 18 s lands before that segment.
- Evidence: Missing.

### S-9 A committed tail

- Drive: from S-8, add a segment «план на квартал» at 21 s.
- Expect: right after that patch, the text holds «план на квартал» once, as committed text, with no tail.
- Evidence: Missing.
