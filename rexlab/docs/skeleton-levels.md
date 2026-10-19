# Skeleton levels

The skeleton game's modes at each age level (`age-levels.md`), and what
each sub-issue of LAB-270 adds to today's game. The behaviour itself is
specified under `features/`; this note is the plan they follow.

## Today's game

Today's game becomes Hatchling, as it is (demote, never delete):

- **Pieces.** The child picks one of three dinosaurs: Tyrannosaurus,
  Triceratops and Stegosaurus. Its skeleton is cut into four pieces (skull,
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
| No cue for where a bone belongs | | each piece and its slot coloured by body area | | LAB-314 |
| One step of help | | help in steps | help in steps | LAB-315: the body region, then a faint ghost, then the piece moves towards its home and back |
| Too easy for a 6-year-old | | | 10–12 pieces, a partial outline, 2–3 distractor bones | LAB-316 (art), LAB-317 |
| No orientation decision | | | some pieces arrive turned; a tap turns one | LAB-318 |
| No reward for playing without help | | badge | badge | LAB-319: a badge for a skeleton finished without the last help step |

Every level keeps the same museum: one star per skeleton, its stand, the
rebuild and the collection score.

## Decisions

- Explorer and Paleontologist play Hatchling's cut until their own
  sub-issues land (LAB-312).
- Every cut comes from the same `skeleton.webp`, so the body picture still
  lies over the finished skeleton and no new picture is generated.
- Paleontologist is LAB-270's Builder mode. The 16–20-piece mode without
  an outline, and naming the dinosaur from its skeleton, go with the
  mystery skeleton (LAB-284).
- The dig stays LAB-283; the odd bone's "not mine" box stays LAB-285.
- Explorer's colours carry the body-area cue, with no phase of sorting
  bones on its own.
