---
date: 2026-10-22
model: claude-opus-5-5
description: "Transcript view — QA"
---

# Transcript view — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `28b4ffebc0f26450e386468e49c14bf70a8b1a48` |
| driven by | the user, reading the panel during a Zoom call with a second device |
| where | the release build on this Mac, the owner and the other device reading timed scripts |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 The owner's words

- Drive: the owner reads a script line.
- Expect: a paragraph headed by its time and «я» in the owner's colour, matching the line.
- Evidence: Missing.

### S-2 The other side's words

- Drive: the other device reads a script line.
- Expect: a paragraph headed by its time and «они» in their colour, matching the line.
- Evidence: Missing.

### S-3 Words appear while the call goes on

- Drive: both sides read a timed script for five minutes; record the screen.
- Expect: each word shows dim within 3 s of its end in the script's timing and at full strength within 10 s, the last word before a pause included.
- Evidence: Missing.

### S-4 Unconfirmed text settles in place

- Drive: record the screen during a five-minute call; find frames where dim words turn full with a different spelling.
- Expect: the confirmed words start at the same x position as the dim ones did; earlier lines do not move.
- Evidence: Missing.

### S-5 Words at a window edge show once

- Drive: the owner reads a five-minute script without pauses.
- Expect: against the script, the panel's text has no word twice and none missing; the script's own repeats stay.
- Evidence: Missing.

### S-6 Late text lands in its place

- Drive: start with «Живой текст» unticked; talk two minutes; tick it.
- Expect: the two minutes appear above the live text, in time order, marked «дописано позже» and dimmer.
- Evidence: Missing.

### S-7 The panel follows the end

- Drive: keep the last line in view while both sides talk.
- Expect: new lines come into view without scrolling.
- Evidence: Missing.

### S-8 The panel stays where the user scrolled

- Drive: scroll up two screens; let both sides talk; press the new-lines pill.
- Expect: the earlier text stays put; a pill counts the new lines; pressing it shows the end.
- Evidence: Missing.

### S-12 Both sides in time order

- Drive: both sides alternate short timed script lines for two minutes.
- Expect: «я» and «они» paragraphs alternate in the script's order.
- Evidence: Missing.

### S-14 Confirmed words never change

- Drive: a recording with live text; note the first confirmed paragraph's text; keep talking ten minutes.
- Expect: that paragraph's text is byte-identical after ten minutes.
- Evidence: Missing.
