# Dig levels

The dig game (LAB-335): the child brushes sand off a covered picture with
a finger until a dinosaur shows. Its modes at each age level
(`age-levels.md`), and the sub-issues that build them. The behaviour is
specified in `features/dig-*.feature`; this note is the plan they
follow. The frames are the "Dig" frames of `../design/rexlab.pen`, and
its home with the DIG tile; their sand art is a mock-up of the brush,
not shipped art.

## The brush

The one interaction at every level.

- **Brushing.** A finger dragged over the sand clears a soft round path
  under it; a tap clears one round spot, so a child who taps still digs.
  Grains puff from the brush; under reduced motion the sand just clears.
- **No fail state.** No timer, no penalty, no wrong place to brush, at any
  level.
- **The sand counts in cells.** The picture is split into a grid of cells
  (40 by 30 over the 800×600 frame). A cell is clear once the brush has
  passed over most of it. Only cells over the dinosaur, its picture's
  opaque pixels, count towards uncovering it, so brushing an empty corner
  is fine but never needed.
- **The last grains blow away.** Once most of the dinosaur's cells are
  clear, the rest of the sand blows off in one gust, so no child hunts
  for the last grains. Hatchling's gust comes at 70% of the dinosaur.
- **The brush is a size a finger can steer.** 48 CSS pixels across at
  Hatchling, 36 at Explorer and Paleontologist.

## The levels

| | 🥚 Hatchling | 🦖 Explorer | 🦴 Paleontologist |
| --- | --- | --- | --- |
| The picture | one dinosaur's body picture, large | the same | the same, the dinosaur unnamed until the end |
| The task | brush anywhere until it shows | find 3 marked details; brush anywhere else freely | follow 3 clues, one at a time, then name the dinosaur |
| Prompts | none | 3 find cards beside the sand, each a round close-up of its detail from the picture (EYE, FOOT, TAIL…) | one clue card at a time, the next only when this one is found |
| A found detail | | its card gets a tick and a star pops; its spot sparkles | the same, and the next clue card slides in |
| The end | the gust at 70% of the dinosaur | the gust once all 3 are found | 3 body pictures to choose from; the right one blows the sand away |
| Help | | after 10 s with nothing found, the next detail's spot thins and shows through the sand | the same; a wrong pick fades that card and the child picks again |

- **Why these steps.** Hatchling is the parent's observation as it is:
  free brushing with nothing to get wrong. Explorer adds looking for a
  shown detail, with no order, so the child still brushes where they
  like. Paleontologist adds order (the clues come one at a time) and
  deduction (the dinosaur is named from what the clues uncovered), never
  speed.
- **Details.** A detail is a spot on the dinosaur's body picture: an
  eye, a foot, the tail, a horn, a plate, a claw, a crest, a sail, a
  frill or a beak. A spot is found once most of its cells are clear.
  Each dinosaur in the game has three to five spots, in
  `src/data/dig.json`; a round picks 3.
  The close-up on a card is the picture itself, cropped round the spot,
  so the card shows exactly what to find. Its word is a small caption
  under it, not the cue.
- **Paleontologist's choice.** The 3 pictures are the dinosaur and two
  others that differ from it in the clues' details where they can, as
  the find the pair silhouettes are picked.

## A round, its rewards and the offer

- **No choice screen.** "DIG" starts a round at once, as "SORT" does: a
  dinosaur the child has not dug up yet at this game, else any.
- **The reveal.** When the gust has blown, the dinosaur stays whole with
  its name, large, and a star flies to "DUG UP".
- **Stars.** Every dinosaur dug up for the first time, at any level,
  earns its star once. The collection score is the dinosaurs dug up, out
  of all of them, with the best-score celebrations of the other games
  when it grows; it is the same at every level (`age-levels.md`, "Same
  rewards").
- **Explorer and Paleontologist** also pop a small star for each detail
  found. Paleontologist's dinosaur named at the first pick earns its
  🦴 badge on its "DUG UP" card.
- **The result.** The reveal is the result: the level switch above
  "DIG AGAIN" with 🔄, and "HOME" with 🏠, as the sorting game's.
- **The offer up.** A strong round is one finished without the help's
  shown spot (Hatchling: every round, so 3 rounds offer Explorer);
  Explorer's offers Paleontologist; Paleontologist offers nothing.
- **Home.** The "DIG" tile, 🖌️ a brush over sand, joins the fourth column
  above "MORE COMING", which halves.

## Sub-issues

| Sub-issue | Builds |
| --- | --- |
| LAB-340 Design (this note, the frames) | |
| LAB-341 The brush and Hatchling | the sand in cells, brushing and taps, the gust, the reveal, stars and "DUG UP", the home tile, the level switch with every level playing Hatchling |
| LAB-342 Dig spots (art data) | 3–5 spots for every dinosaur in `dig.json`, with a test that each lies on the dinosaur's opaque pixels |
| LAB-343 Explorer | find cards, found details, the help, the offer from Hatchling |
| LAB-344 Paleontologist | clues in order, the choice of 3, the badge, the offer from Explorer |

The brush of LAB-341 is a component of its own, so the skeleton
game's dig (LAB-283) brushes the same sand.

## Accepted by the owner

- The game's name: "DIG", "РАСКОПКИ".
- Hatchling's gust at 70% of the dinosaur, so a 4-year-old never hunts
  the last grains.
- Three details at Explorer and three clues at Paleontologist.
- Paleontologist names the dinosaur from 3 body pictures, not its
  skeleton: every dinosaur has a body picture, and only five have a
  skeleton.
- Stars for each dinosaur dug up, not for each round, so the collection
  is the long goal.
