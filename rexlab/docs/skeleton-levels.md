# Skeleton levels

The skeleton game's modes at each age level (`age-levels.md`). The behaviour
is specified under `features/skeleton-assembly-*.feature`; this note says
what each level adds and why.

## Hatchling

The base game:

- **Pieces.** The child picks one of five dinosaurs: Tyrannosaurus,
  Triceratops, Stegosaurus, Brachiosaurus and Spinosaurus. Its skeleton is
  cut into four pieces (skull, spine, legs, tail), each cut straight from
  one whole `skeleton.webp`.
- **The puzzle.**
  - The pieces wait in a tray, the right way up, beside a full outline.
  - A piece dropped near its home (at least 24 CSS pixels; the build uses
    48) fits there; any other drop floats it back to the tray.
  - Once all pieces fit, the dinosaur is revealed with its name and one
    fact.
- **Help.** After 10 seconds with no piece fitted, the first piece left in
  the tray and its slot glow (`skeleton-assembly-help.feature`).

## What each level adds

| | Hatchling | Explorer | Paleontologist |
| --- | --- | --- | --- |
| Pieces | 4 | 6–8 | 10–12, with 2–3 other dinosaurs' bones |
| Outline | full | full | partial |
| Help | one step | in steps: the body region, then a faint ghost, then the piece moves towards its home and back | the same as Explorer |
| Reward for no last help step | none | badge | badge |

At every level:

- A cut has any number of pieces; a level with no cut of its own for a
  skeleton plays Hatchling's.

- The game starts at the age level, with a level switch on the selection
  screen; the child's choice is kept.
- Every pick-up, fit and miss has a sound and a movement; the finished
  skeleton stomps and roars (`game-design.md`).
- Once a skeleton has its star, a mystery skeleton gives something to find
  out: the child builds one of the starred skeletons, cut for the chosen
  level, with its name hidden, then guesses whose it is from three
  dinosaurs' bodies; a wrong guess gives a clue.
- **Rewards.** A finished skeleton earns its dinosaur's star once and its
  museum stand; a rebuild earns no new star. The collection score counts
  stars, so its best is the same at every level.

## Decisions

- Every cut comes from the same `skeleton.webp`, so the body picture still
  lies over the finished skeleton and no new picture is generated.
- Naming the dinosaur from its skeleton is the mystery skeleton; a
  16–20-piece mode without an outline is not built.
- The mystery is one of the skeletons with a star, cut for the level the
  switch shows, and earns no star of its own. Explorer and
  Paleontologist guess it from itself, one of its look-alikes and one
  dinosaur unlike it; Hatchling, and Spinosaurus, which has no
  look-alike, from itself and two dinosaurs unlike it. Every choice is of
  a skeleton's look-alike group, so never a flying or sea reptile.
- No dig before the build and no "not mine" box: the DIG game digs,
  and leaving another dinosaur's bone aside is the judgement.
- No body-area colours and no turned pieces: colours make placing a bone
  matching a colour, and turning is finger work, not a decision. Explorer
  places by shape on the full outline; Paleontologist's one new thing is
  the bare silhouette with other dinosaurs' bones, a single judgement of
  whether a bone belongs.
- Only Hatchling outlines a held bone's home; Explorer and Paleontologist
  shuffle the tray for each puzzle, so neither the outline nor the order
  gives a bone's place away.
- Explorer's and Paleontologist's pieces follow the bones the picture
  draws, cut by `scripts/recut-skeletons.ts`; Hatchling's four stay cut
  straight, so each level has its own pieces.
- Explorer's and Paleontologist's help waits while the child is busy: a
  touch of any piece hides it and counts its ten seconds again, and it
  comes for the piece last handled rather than the first in the tray.
  Hatchling's help is never put off by trying.
