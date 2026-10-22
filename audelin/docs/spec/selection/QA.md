---
date: 2026-10-22
model: claude-opus-5-5
description: "Selection — QA"
---

# Selection — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `5da72fc77b71296794414302308c5e836407ec1f` |
| driven by | the user, selecting in the panel during a Zoom call with a second device |
| where | the release build on this Mac (the debug build where a row says so) |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Selecting and copying during a call

- Drive: select a phrase; ⌘C; paste into TextEdit.
- Expect: the pasted text matches the phrase.
- Evidence: Missing.

### S-2 New text below the selection

- Drive: select a phrase in an earlier paragraph; let both sides talk a minute; ⌘C.
- Expect: the same phrase stays highlighted; the copy matches it.
- Evidence: Missing.

### S-3 Selected words settle in place

- Drive: select dim words at a paragraph's end; wait until they are full strength, spelled the same.
- Expect: the same words stay highlighted.
- Evidence: Missing.

### S-4 Selected words are replaced

- Drive: record the screen during a five-minute call, selecting dim words at each paragraph's end; find a frame where selected dim words are re-spelled.
- Expect: the replacing words are highlighted in their place; ⌘C then copies them.
- Evidence: Missing.

### S-5 The selection keeps the panel still

- Drive: at the end of the text, select a phrase; let both sides talk.
- Expect: the panel does not scroll; the selection stays highlighted on the same words.
- Evidence: Missing.

### S-6 Copying across both speakers

- Drive: select from a «я» paragraph into the next «они» one; ⌘C; paste into TextEdit.
- Expect: the paste has each paragraph's time and speaker before its words.
- Evidence: Missing.

### S-7 Late text above the selection

- Drive: start with «Живой текст» unticked; talk; tick it; select a live phrase at once.
- Expect: as the earlier minutes fill in above, the same phrase stays highlighted.
- Evidence: Missing.

### S-8 Late text inside the selection

- Drive: live text on; say marked phrase A; untick «Живой текст»; talk two minutes; tick it; say phrase B; as B shows, select from A to B; ⌘C after the fill-in; paste into TextEdit.
- Expect: the paste holds A, the filled-in two minutes, then B, in time order.
- Evidence: Missing.
