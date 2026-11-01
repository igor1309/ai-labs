# Skeleton levels

The skeleton game's modes at each age level (`age-levels.md`), and what
each sub-issue of LAB-270 adds to today's game. The behaviour itself is
specified under `features/`; this note is the plan they follow.

## Today's game

Today's game becomes Hatchling, as it is (demote, never delete):

- **Pieces.** The child picks one of five dinosaurs: Tyrannosaurus,
  Triceratops, Stegosaurus, Brachiosaurus and Spinosaurus. Its skeleton is cut into four pieces (skull,
  spine, legs, tail), each cut from one whole `skeleton.webp`.
- **The puzzle.**
  - The pieces wait in a tray, the right way up, beside a full outline.
  - A piece dropped within 24 CSS pixels of its home fits there; any other
    drop floats it back to the tray.
  - Once all four fit, the dinosaur is revealed with its name and one
    fact.
- **Help.** After 10 seconds with no piece fitted, the first piece left in
  the tray and its slot glow (`skeleton-assembly-help.feature`).
- **Rewards.**
  - A finished skeleton earns its dinosaur's star once and its museum
    stand. The collection score counts stars, so its best is the same at
    every level.
  - A rebuild earns no new star.

## Gaps, and what closes each

| Gap | Hatchling | Explorer | Paleontologist | Sub-issue |
| --- | --- | --- | --- | --- |
| A puzzle is built from fixed four pieces | ✓ | ✓ | ✓ | LAB-311: a puzzle is built from a cut of any number of pieces |
| The game has no levels | ✓ | ✓ | ✓ | LAB-312: the game starts at the age level, with a level switch on the selection screen, the child's choice kept |
| Too few pieces for a 5-year-old | | 6–8 pieces | | LAB-313 (art), LAB-314 |
| One step of help | | help in steps | help in steps | LAB-315: the body region, then a faint ghost, then the piece moves towards its home and back |
| Too easy for a 6-year-old | | | 10–12 pieces, a partial outline, 2–3 distractor bones | LAB-316 (art), LAB-317 |
| No reward for playing without help | | badge | badge | LAB-319: a badge for a skeleton finished without the last help step |
| Silent, still and the same every time (`game-design.md`) | ✓ | ✓ | ✓ | LAB-389: a sound and a movement for every pick-up, fit and miss; the finished skeleton stomps and roars |
| Nothing to find out once every skeleton has its star | ✓ | ✓ | ✓ | LAB-284: a mystery skeleton, one already built with its name hidden, guessed from three dinosaurs' bodies; a wrong guess gives a clue |

Every level keeps the same museum: one star per skeleton, its stand, the
rebuild and the collection score.

## Decisions

- Explorer and Paleontologist play Hatchling's cut until their own
  sub-issues land (LAB-312).
- Every cut comes from the same `skeleton.webp`, so the body picture still
  lies over the finished skeleton and no new picture is generated.
- Paleontologist is LAB-270's Builder mode. Naming the dinosaur from its
  skeleton is the mystery skeleton (LAB-284); the 16–20-piece mode
  without an outline is not built.
- The mystery is one of the skeletons with a star, cut for the level the
  switch shows, and earns no star of its own (LAB-284). Explorer and
  Paleontologist guess it from itself, one of its look-alikes and one
  dinosaur unlike it; Hatchling, and Spinosaurus, which has no
  look-alike, from itself and two dinosaurs unlike it. Every choice is of
  a skeleton's look-alike group, so never a flying or sea reptile.
- No dig before the build and no "not mine" box: the DIG game digs,
  and leaving another dinosaur's bone aside is the judgement (LAB-283,
  LAB-285 closed).
- Explorer's body-area colours (LAB-314) and Paleontologist's turned
  pieces (LAB-318) are gone (LAB-389). The colours made placing a bone
  matching a colour; turning was finger work, not a decision. Explorer
  places by shape on the full outline; Paleontologist's one new thing is
  the bare silhouette with other dinosaurs' bones, a single judgement of
  whether a bone belongs.
- Only Hatchling outlines a held bone's home; Explorer and Paleontologist
  shuffle the tray for each puzzle, so neither the outline nor the order
  gives a bone's place away (LAB-323).
- Explorer's and Paleontologist's pieces follow the bones the picture
  draws, cut by `scripts/recut-skeletons.ts`; Hatchling's four stay cut
  straight, so the pieces the levels shared are now each level's own
  (LAB-323).
- Explorer's and Paleontologist's help waits while the child is busy: a
  touch of any piece hides it and counts its ten seconds again, and it
  comes for the piece last handled rather than the first in the tray.
  Hatchling's help is as it was, never put off by trying (LAB-346).
