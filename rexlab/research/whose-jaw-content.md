---
date: 2026-10-28
model: claude-opus-5-5
description: "Assets and content for Whose Jaw? (Чья челюсть?), LAB-707: pictures, facts, words, sounds and licensing."
---

# Whose Jaw? (Чья челюсть?): assets and content

Built on the "Required assets" section of `whose-jaw-design.md`. This doc
lists what is ready, where it lives, and what the code (LAB-705) still
makes itself.

## Pictures

| Asset | Where | State |
| --- | --- | --- |
| Jaw style prompt, gummy mouth prompt | `../art/style.md` | ready |
| 16 jaw lines | `../art/prompts.md`, "Jaws" | ready |
| 16 jaws, 600×450 WebP, alpha | `../src/assets/jaws/<id>.webp` | generated |
| 16 gummy mouths, 800×600 WebP, alpha | `../src/assets/dinos/<id>/gummy.webp` | generated |
| Mouth with jaw (closed) | — | not made: the jaw is layered on the gummy mouth, as the design allows |
| Steak and leafy branch | `../src/assets/care/meat.webp`, `plants.webp` | reused; the "bitten" frame is a mask in code |
| Reactions (OW!, HMM?, loose), shelf, sockets, 🦷 tile | — | drawn in code (CSS/SVG), like the other games' badges and bars |

`../scripts/jaw-picture.sh <id>...` remakes the jaw and gummy mouth of any
dinosaur.

## Sounds

Made with Web Audio, as `../src/skeletonSounds.ts` does: snap click, chomp
crunch (a different pitch per jaw on the shelf), OW!, HMM?, steps, tray
slide. There are no recorded files, so there is nothing to license.

## Words

Per dinosaur, in `../src/data/jaws.json`: the one-line jaw fact (for 🦴 and
the shelf card), the 🦴 "does not fit" hint, the look-alike pair, and the
source page. Fixed words, EN / RU:

| Key | EN | RU |
| --- | --- | --- |
| title | WHOSE JAW? | ЧЬЯ ЧЕЛЮСТЬ? |
| play | PLAY | ИГРАТЬ |
| shelf | JAW SHELF | ПОЛКА ЧЕЛЮСТЕЙ |
| again | PLAY AGAIN | ЕЩЁ РАЗ |
| home | HOME | ДОМОЙ |
| ow | OW! SHARP TEETH! | АЙ! ОСТРЫЕ ЗУБЫ! |
| hmm | HMM? FLAT TEETH! | ХМ? ПЛОСКИЕ ЗУБЫ! |
| newBest | NEW BEST! | НОВЫЙ РЕКОРД! |
| meat | MEAT | МЯСО |
| plants | PLANTS | РАСТЕНИЯ |

## Licensing

- Every picture is AI-generated for RexLab (Codex image generation) and
  recorded in `../src/assets/jaws/CREDITS.md`. No stock, museum or other
  third-party images are used.
- Sounds are synthesised in code.
- The facts are our own short sentences. Sources are cited, not copied.

## Open

- Before release, each fact must still be checked against its source page,
  as `../docs/sources.md` requires.
- Some jaws show their cue only weakly. Ankylosaurus's teeth are drawn too
  big, Brachiosaurus's look more like pegs than spoons, and Mosasaurus's
  palate teeth do not show. They are good enough to build with, and the
  script can remake them.
