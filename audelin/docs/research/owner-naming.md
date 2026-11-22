# Naming the owner in the notes request

Does replacing the owner's `Me` label with their name change the call notes, and
which variant should the app build?

## Method

[`owner-naming/run.py`](owner-naming/run.py) rebuilds the production notes request for a
saved call: the generator's faithfulness text, the template's instructions and heading
sets, empty accepted evidence, and `[seconds] label: text` lines. It runs the request through
`claude -p --model opus` with the runtime's own arguments. Finished calls keep no job
file, so the entries come from the call's `transcript.md`. Times there are whole
seconds, and the speaker-stage evidence is not available; both are the same in every
variant. Notes go to `$TMPDIR/owner-naming`, never to the repo.

Four variants per call, differing only as stated:

| Variant | Owner label | Template |
|---|---|---|
| `me` | `Me`, as Audelin writes it | the owner's `~/.audelin/Templates/Default.md` (what the app runs) |
| `name` | the owner's name (`zoomName`, else the macOS full name) | same |
| `told` | the owner's name | same, plus one line: the owner recorded the call and their label is theirs |
| `builtin` | `Me` | the shipped built-in Default |

The owner's template copy is an older text ("Do not guess identities, owners, names");
the shipped Default asks to name people as the conversation names them. `builtin` checks
whether that template difference changes the notes as much as the label does.

Calls: three 1:1s (2026.11.18-1500, 11.16-1248, 11.05-1400), one three-person call
(11.17-1620) and two dailies (11.11-1000, 11.18-1019). One run per variant.
[`owner-naming/count.py`](owner-naming/count.py) counts `Me`/«Ме» used as a person, the
owner's name in Latin or Cyrillic, and actions with an unclear owner. Who-did-what was
checked by hand: each owner statement, request and action in the notes against the
transcript lines it cites.

## Result

| Call | `me`: Me / name | `name`: Me / name (Latin) | `told`: Me / name (Latin) | `builtin`: Me / name |
|---|---|---|---|---|
| 11.05-1400 1:1 | 16 / 2 | 0 / 20 (0) | 0 / 22 (0) | 13 / 2 |
| 11.11-1000 daily | 0 / 17 | 0 / 18 (0) | 0 / 14 (0) | 0 / 17 |
| 11.16-1248 1:1 | 0 / 7 | 0 / 8 (6) | 0 / 13 (0) | 3 / 4 |
| 11.17-1620 3 people | 0 / 7 | 0 / 9 (8) | 0 / 7 (0) | 0 / 3 |
| 11.18-1019 daily | 1 / 0 | 0 / 20 (10) | 0 / 10 (0) | 0 / 0 |
| 11.18-1500 1:1 | 9 / 0 | 0 / 15 (13) | 0 / 13 (0) | 11 / 1 |

- **`Me` breaks names, not attribution.** In every call and variant, what the owner
  said, asked and took on is attached to the owner; no owner line was given to a remote
  speaker or the reverse. With `Me` the owner gets a name only when someone says it
  aloud (the dailies, 11.17-1620). Otherwise they become «Me» (1:1s: 9–16 times per note)
  or a made-up role, «Ведущий (Me)» in 11.18-1019.
- **Naming removes `Me` everywhere** and puts the owner's name on their statements and
  actions in all six calls.
- **The name alone leaks the Latin spelling.** With `name`, four of six Russian notes write
  the name in Latin letters, sometimes mixed with the Cyrillic form in one note. With
  `told`, every note writes the name in Cyrillic and declines it.
- **The template is not as strong a lever.** `builtin`, whose text asks to name people
  as the conversation names them, still writes «Me» in the 1:1s (13, 3 and 11 times) and
  attributes the same way as `me`. Other differences between variants (one action more or
  fewer, an inferred action moved to open questions in 11.17-1620, length ±15 %) are of
  the kind one rerun of the same request also produces; one run per variant cannot
  separate them from noise.

## Recommendation

Build `told`: before the notes request, replace the owner's label with their name
(`zoomName`, else the macOS full name, as Amanu does) and add one line to the request
saying the owner recorded the call under that label. The speaker-identification request
reads the same transcript, so it should get the same label.

Open: whether the owner's stale template copy should be updated to the shipped Default.
That is a separate change, since it did not change who-did-what here; nor did these runs
measure variation between reruns of one request.
