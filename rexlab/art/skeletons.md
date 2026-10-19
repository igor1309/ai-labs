# RexLab skeleton art

A skeleton of the skeleton game is one picture, traced from its
dinosaur's body picture, then cut into pieces for each age level
(`docs/skeleton-levels.md`). Every cut comes from that one picture, so the
body still lies over the finished skeleton and no new picture is
generated per level.

## 1. The whole skeleton

From `rexlab/`, for each new dinosaur, by its id in
`src/data/dinosaurs.json`:

```sh
scripts/skeleton-picture.sh brachiosaurus spinosaurus
```

Codex image generation traces the skeleton from
`src/assets/dinos/<id>/body.webp` in the same pose and framing. The prompt
lives in the script: warm ivory bones with soft shading and a clean dark
outline, few chunky bones a child can read, on plain white. The picture is
made 800×600, the white around and between the bones cleared to alpha
(a 7% fuzz), and saved as `src/assets/skeletons/<id>/skeleton.webp`.

Each dinosaur takes a few minutes: run it in the background. The work
directory it prints keeps Codex's log and `<id>-overlay.png`, the body at
half strength over the skeleton. Look at it: the head, legs and tail must
line up under the body. Look at the skeleton on a dark background too, for
white left between bones. Run it again for a skeleton that misses.

## 2. The cut lines

`skeleton-cuts.json` holds each skeleton's cut lines, per level, in the
level's piece order:

- `id`, `area` and `name` (English and Russian, in capitals) are the
  piece's as the game shows them; `area` is one of the body areas of
  `docs/skeleton-levels.md`.
- `from` is the piece's source: `skeleton`, the whole picture, for
  Hatchling; one of Hatchling's pieces for Explorer; one of Explorer's
  for Paleontologist.
- `region` is a list of polygons in the 800×600 frame. The piece takes
  its source's pixels inside them, outlines included, that no piece
  before it in the level has taken.
- Each source has one piece with no `region`, taking all the rest of it.
  A piece that is the whole of a source of its own id, such as a skull
  Explorer keeps whole, is that source's file.

Hatchling has four pieces, `skull`, `spine`, `legs` and `tail`; Explorer
six to eight along the body areas; Paleontologist ten to twelve. A test
checks that every source is cut, each with one rest, and that the file
matches `src/data/skeletons.json`.

Draw the lines, then look at them:

```sh
python3 scripts/cut-skeleton.py <id> --preview /tmp/<id>-cuts
```

It writes nothing but `<id>-<level>.png`, each piece in its own colour
over a 50-pixel grid. Move the lines until each piece is whole bones, with
no stray pixels of another.

## 3. The pieces

```sh
python3 scripts/cut-skeleton.py <id>
```

It writes each piece as `src/assets/skeletons/<id>/<piece>.webp`,
losslessly, and the skeleton's cuts, with every piece's place, into
`src/data/skeletons.json`. `--levels explorer,paleontologist` cuts only
those levels, reading Hatchling's pieces from their files: the shipped
skeletons' Hatchling pieces were cut before this script, so re-cut only
their later levels.

Then, by hand, in `src/data/skeletons.json`:

- the skeleton's `fact`, English and Russian, in capitals, following
  `docs/sources.md`;
- its `distractors`: two or three Paleontologist pieces of other
  skeletons, each named with its dinosaur.

Record the picture's generator and date in
`src/assets/skeletons/CREDITS.md`.

Needs `codex` signed in, ImageMagick (`magick`), `cwebp`, and Python 3
with Pillow.
