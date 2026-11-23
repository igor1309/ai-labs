# Coloring pictures from traced line art

An Explorer coloring picture is a generated coloring page traced into regions.
The page is drawn by an image model, so it has an illustrator's line; the
tracer turns it into geometry the coloring game paints and tests.

## Prompt

Generate with Codex image generation, attaching the creature's catalogue body
picture (`src/assets/dinos/<id>/body.webp` flattened on white) as the
reference animal. Fill in the creature, its telling features and its scenery:

> Children's coloring-book page: pure black line art on pure white, no
> colour, no grey, no shading, no hatching, no texture, no text. Landscape
> 4:3. The whole scene sits inside a bold rounded-rectangle frame just inside
> the image edge. A friendly but anatomically faithful <creature> drawn like
> the attached reference animal (<its proportions>), side view, filling about
> 60% of the frame. The animal's outer outline is the boldest line; inner
> lines medium; scenery lines thinner. Every shape is a CLOSED area with no
> gaps; every line that divides the scene runs all the way to the frame or to
> another line. On the animal, as closed areas: <its telling features>.
> Scenery as broad simple shapes, each at least a thumb wide, never thin
> fronds or grass blades: <horizon, hills, plants, stones>.

What the prompt guards against:

- **A frame and lines that reach it.** A horizon that stops short of the edge
  joins sky and ground into one region. The trace removes the page's frame
  and closes the areas along the picture's edge.
- **Broad leaves.** A thin frond or blade can never be a tap target, since a
  tap on ink paints nothing; it would end up as part of the ground.
- **A broad animal.** The raster contract wants a 40 px solid square in each
  main body part (head, body, tail, legs) and 24 px in every other region,
  at the 920 × 620 canvas. A far leg drawn slim fails it.
- **A deep, plain head.** Ask for a large, deep head with the mouth closed and
  only the eye, a nostril and one mouth line inside it. Extra lines on a long
  snout cut the head into slivers the tracer merges into the scenery.

## Tracing

From `rexlab/`, with numpy, scipy and opencv-python-headless installed:

```sh
python3 scripts/coloring-trace.py art/coloring/<scene>.png traced.json art/coloring/<scene>.groups.json
python3 scripts/coloring-emit.py traced.json art/coloring/<scene>.names.json <CONST> <version> src/coloring/<file>.ts
```

The trace drops the page's own frame and fits the whole picture inside the
3:2 canvas, centred, cutting nothing. It closes the areas at the picture's
edge without drawing a line there, and marks each area that reaches the edge
open; the emit step also marks the sky, land and water areas open. An open
area shows the paper colour until it is filled, so the scene has no frame.

The trace prints its region count. Render `traced.json` with a colour per
region and its ids, then write two design-time files beside the page:

- `<scene>.groups.json`: per object, canvas points of the areas that form it,
  where the automatic merge would put a piece in the wrong object: a plant's
  leaves and trunk, a tail tip and its last stripe, toes and their leg.
- `<scene>.names.json`: each traced id's region name, in paint order (scenery
  first, then the animal from far to near). Names are the voice targets.

`coloring-emit.py` prints one interior probe per region for the scene's
tests. Tracing is deterministic: the same page and groups give the same ids.

## Pictures that leave space round them

A picture drawn smaller than the canvas, such as a lone animal on a strip of
ground, gets an enlarged version in `src/coloring/fitted.ts`. It is the same
geometry under a view that scales it until it touches the canvas edges in its
tighter direction and centres it in the other. Measure the drawn bounds of
the original at 920 × 620, then set `scale` to fit them with a 2 px margin
and `x`, `y` (logical px) to centre them.

## Files

| Scene | Page | Regions |
| --- | --- | --- |
| `trex-explorer-4` | `coloring/trex-explorer-4.png` | 40 |
| `spinosaurus-explorer-4` | `coloring/spinosaurus-explorer-4.png` | 35 |
| `brachiosaurus-explorer-2` | `coloring/brachiosaurus-explorer-2.png` | 38 |
| `mosasaurus-explorer-2` | `coloring/mosasaurus-explorer-2.png` | 36 |
| `parasaurolophus-explorer-2` | `coloring/parasaurolophus-explorer-2.png` | 43 |
| `trex-explorer-5` | `coloring/trex-explorer-5.png` | 42 |
| `spinosaurus-explorer-5` | `coloring/spinosaurus-explorer-5.png` | 37 |
| `brachiosaurus-explorer-3` | `coloring/brachiosaurus-explorer-3.png` | 39 |
| `mosasaurus-explorer-3` | `coloring/mosasaurus-explorer-3.png` | 37 |
| `parasaurolophus-explorer-3` | `coloring/parasaurolophus-explorer-3.png` | 43 |
