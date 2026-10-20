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
  Taps go through the app's double-tap filter like any other, so a
  second tap at once in the same place clears nothing more.
  The hollow's edge crumbles, with a pale lip of loose grains on the
  sand around it and the sand's shadow inside, and under the sand lies
  a bed of darker, damp sand, never the page (LAB-360).
  Grains puff from the brush; under reduced motion the sand just clears.
- **No fail state.** No timer, no penalty, no wrong place to brush, at any
  level. A wrong pick at the question only fades that card.
- **The sand counts in cells.** The picture is split into a grid of cells
  (40 by 30 over the 800×600 frame). A cell is clear once the brush has
  passed over most of it. Only cells over the dinosaur, where its
  picture shows in more than a tenth of the cell, count towards
  uncovering it, so brushing an empty corner is fine but never needed.
  The cells are worked out once from the pictures and kept in
  `src/data/dig.json`.
- **The last grains blow away.** When the round is done, the rest of
  the sand blows off in one stroke over about 0.8 s, so no child hunts for the last grains:
  at Hatchling at 95% of the dinosaur's cells, so the child digs the
  whole dinosaur; at Explorer and Paleontologist at the right pick.
- **The brush is a size a finger can steer.** 48 CSS pixels across at
  Hatchling, 36 at Explorer and Paleontologist.

## The levels

DIG v2 (LAB-358): each round above Hatchling is a mystery. The board is
all sand, with nothing beside it to give the dinosaur away; the picture
itself shows how far the dig has come. The frames are the "Dig ·
Storyboard" row of `../design/rexlab.pen`.

| | 🥚 Hatchling | 🦖 Explorer | 🦴 Paleontologist |
| --- | --- | --- | --- |
| The picture | one dinosaur's body picture, large, under all the sand | the same, unnamed until the end | the same |
| The task | brush until it shows | brush, then name it from 3 body pictures | brush, then name it from 4 |
| The question | none | at 75% of the dinosaur clear, "WHO IS IT?" and 3 cards beside the board | the same with 4 cards |
| The end | the gust at 95% of the dinosaur | the gust at the right pick | the same |
| A found spot | a ring and a star shine where it lies | the same | the same |
| Help | every 10 s with nothing more of the dinosaur cleared, the next spot thins and shows through the sand | the same; a wrong pick fades that card and the child picks again | the same |

- **Why these steps.** Hatchling is free brushing with nothing to get
  wrong. Explorer and Paleontologist add deduction: the dinosaur is
  named from what the brush uncovered, and asked only once three
  quarters of it show, so the pick is a judgement rather than a guess.
  Paleontologist's fourth card makes it harder; nothing adds speed.
- **No spoilers.** A playtest of v1 found its find cards a checklist:
  the round ended once their spots were found, and its close-ups showed
  the dinosaur before it was dug. The child expects to dig the whole
  picture, so brushing goes on while the question shows, and only the
  pick ends the round.
- **The board arrives and moves.** It drops from above and settles,
  puffing grains from its bottom edge. In a round that asks, it drops
  into its place beside the choice column and never moves sideways
  again: not at the question, a pick, the gust or the lift. The column
  holds an empty "?" card for each choice from the start (3 at
  Explorer, 4 at Paleontologist), each the size and place of the card
  that replaces it; at 75% each turns over into its dinosaur's card,
  60 ms apart. Hatchling's board is centred, with no column. Reduced
  motion fades the board in without a puff and fades the cards in with
  no turn.
- **Spots.** A spot is a detail on the dinosaur's body picture: an eye,
  a foot, the tail, a horn, a plate, a claw, a crest, a sail, a frill or
  a beak. A spot's cells are the dinosaur's cells whose middle lies in
  it, and it is found once most of them are clear. Every dinosaur shows
  an eye, feet, a tail and claws; horns, plates, crests, sails, frills
  and beaks are telling traits only some show, and `dig.json` lists
  each dinosaur's. Each dinosaur has three to five spots, in
  `src/data/dig.json`. Help thins them in a random order drawn at the
  round's start.
- **The look-alikes.** The question's other cards are the dinosaur's
  closest look-alikes: of the telling traits and spot kinds either of
  two dinosaurs shows, the share both show. Equals are drawn at random,
  and the cards come in a random order.

## A round, its rewards and the offer

- **No choice screen.** "DIG" starts a round at once, as "SORT" does: a
  dinosaur the child has not dug up yet at this game, else any but the
  last round's.
- **The lift.** After the gust, the dinosaur lifts from its damp bed
  with a warm glow over about 0.5 s. On a first dig a star flies into the
  bar's "DUG UP" chip, then its count ticks up; a repeat lifts without
  a star. Reduced motion uses short fades and changes the count simply.
- **The reveal.** After the lift and star's arrival, the board slides
  away and the whole dinosaur glides into place on the left. On the
  right, its large name, the "DUG UP" card, the celebration if any, the
  level switch, "DIG AGAIN" and "HOME" arrive 60 ms apart. The card's
  star is already in place with NEW! on a first dig, and the count, such
  as "5/42"; it never flies twice. Taps wait for the last item. Reduced
  motion brings everything in together on one short fade.
- **Leaving a round.** HOME before the gust records nothing; from the
  gust onwards the dinosaur is kept, including during the lift or reveal.
- **Stars.** Every dinosaur dug up for the first time, at any level,
  earns its star once. The collection score is the dinosaurs dug up, out
  of all of them, with the best-score celebrations of the other games
  when it grows; it is the same at every level (`age-levels.md`, "Same
  rewards"). The last dinosaur dug up adds a 🏆 to the card.
- **A found spot** shines once as it first shows: a ring spreads and a
  small star pops, which counts towards nothing; under reduced motion
  it does not shine. A
  dinosaur named at the first pick, at Explorer or Paleontologist,
  earns its 🦴 badge, shown on the "DUG UP" card of its reveals.
- **The result.** The reveal is the result: the level switch above
  "DIG AGAIN" with 🔄, and "HOME" with 🏠, as the sorting game's.
- **The offer up.** A strong round is one whose dinosaur is named at
  the first pick, help or not (Hatchling: every round, so 3 rounds
  offer Explorer); Explorer's offers Paleontologist; Paleontologist
  offers nothing.
- **Home.** The "DIG" tile, 🖌️ a brush over sand, joins the fourth column
  above "MORE COMING", which halves.

- **A full collection.** Once all 42 are dug up the card keeps its 🏆
  and a round's reward is its reveal; at Explorer and Paleontologist
  the 🦴 badges still collect. Accepted by the owner (2026-10-19): no further
  collection until a playtest shows children dig on past 42, as 42
  rounds is already a long goal at 5–7.

## Treasures

- **Which rounds.** About one round in three, at every level, hides one
  treasure in its sand. Its kind is drawn: a golden fossil 1 in 20, an
  egg nest 1 in 8, and a shell, a tooth or a drop of amber sharing the
  rest equally. "Treasures", "СОКРОВИЩА": "find" already names a found
  spot (`dig-help.feature`).
- **Where.** On cells of the damp bed with none of the dinosaur, at
  least one cell from the edge, so it never hides a part of the
  dinosaur. Its sand counts toward neither 75% nor the gust.
- **Found.** Brushed more than half clear, it glows, hops and flies
  into the FIELD GUIDE on DIG's bar, whose count ticks up; "NEW!" shows
  for the first of its kind. Brushing goes on during the flight. It is
  kept the moment it lands, even if the child then leaves before the
  gust. One not found tumbles away with the gust and is not kept.
  Reduced motion fades it out and changes the count simply.
- **The FIELD GUIDE.** 📖 "FIELD GUIDE", "ПОЛЕВОЙ ДНЕВНИК": a button
  beside "DUG UP" on DIG's bar, during a round and on the reveal. Its
  page holds five cards in a fixed order, each a picture with its count,
  or an outline and "?" for a kind not found yet, and "n/5" kinds found.
  "BACK" gives back the round or reveal as it was, as turning the iPad
  does; "HOME" leaves as from the round.
- **Kept.** Counts per kind, in DIG's stored progress, one collection
  across all levels. They show nowhere outside DIG.

## Sub-issues

| Sub-issue | Builds |
| --- | --- |
| LAB-340 Design (this note, the frames) | |
| LAB-341 The brush and Hatchling | the sand in cells, with each dinosaur's cells in `dig.json`, brushing and taps, the gust, the reveal, stars and "DUG UP", the home tile, the level switch with every level playing Hatchling |
| LAB-342 Dig spots (art data) | 3–5 spots and the telling traits for every dinosaur in `dig.json`, with a test that each spot lies on the dinosaur's cells |
| LAB-343 Explorer | find cards, found details, the help, the offer from Hatchling |
| LAB-344 Paleontologist | clues in order, the choice of 3, the badge, the offer from Explorer |
| LAB-358 DIG v2, a mystery round | |
| LAB-359 The mystery round | all sand, the question at 75% with look-alikes, help at every level, Hatchling's gust at 95%; v1's find and clue cards go |
| LAB-360 The brush | a brush that crumbles the sand |
| LAB-361 Motion | the motion and the reveal |
| LAB-362 Treasures | treasures in the sand and the FIELD GUIDE |

The brush of LAB-341 is a component of its own, so the skeleton
game's dig (LAB-283) brushes the same sand.

## Accepted by the owner

- The game's name: "DIG", "РАСКОПКИ".
- Hatchling's gust at 95% of the dinosaur, so a 4-year-old digs it
  whole but never hunts the last grains (LAB-359).
- A mystery round at Explorer and Paleontologist: no cards, the
  question at 75%, 3 choices at Explorer and 4 at Paleontologist, a
  wrong pick fading and staying out (LAB-358).
- The dinosaur is named from body pictures, not its skeleton: every
  dinosaur has a body picture, and only five have a skeleton.
- Stars for each dinosaur dug up, not for each round, so the collection
  is the long goal.
- Treasures in about one round in three, at every level, kept in a
  FIELD GUIDE page beside DUG UP (LAB-362).
