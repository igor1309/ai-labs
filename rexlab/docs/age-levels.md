# Age levels

The same games serve a child of about 4 and one of about 6. A parent picks
an approximate age level next to the theme and language controls
(LAB-291); each game maps its modes to the three levels.

| Level | Picture | Age |
| --- | --- | --- |
| Hatchling | 🥚 | about 4 |
| Explorer | 🦖 | about 5 |
| Paleontologist | 🦴 | 6 and up |

## Rules

- **Default.** A new install starts at Explorer.
- **Global default, per-game override.** The setting picks the level every
  game starts at. A game that offers its own level switch remembers the
  child's choice there, and that choice wins until the setting changes
  again.
- **Nearest lower level.** A game with no mode for the chosen level plays
  its nearest lower one. Today's games, which have only Hatchling, play as
  they do now at every level.
- **Same rewards.** A star is a star at every level; the museum, the
  collection and achievements fill up whatever the level. A best score
  belongs to the level it was set at: a game shows and celebrates the
  best of the level it plays, so moving up never caps the celebrations
  (owner, 2026-10-18).
- **Offer up, never down.** After 3 strong rounds in a row at one level,
  a result offers the next level in one card: that of the round that
  completes the count, or, if the child left it before the card began to
  rise in, the next strong round's. The card has that level's picture and a one-tap "YES"
  or "NOT NOW" (LAB-293). "YES" sets the game's own choice, never the
  setting. "NOT NOW", or leaving a shown offer unanswered, turns the
  offer down at that level: from then on it takes 5 strong rounds in a
  row there, not 3, until "YES" is tapped there; other levels keep 3.
  Showing the card, a round that is not strong, or a round at another
  level starts the count again. Each game with an offer says what a strong
  round is in its own offer feature; the sorting game has none
  (LAB-295). Nothing moves a child down, and no words say a round went
  badly; a game's top level offers nothing.
- **Demote, never delete.** A game made harder keeps its current behaviour
  as its easiest level; the rule is in `../AGENTS.md`.

## Each game's levels

The starting point for each game's own issue, which refines its row; keep
this table in step as they land.

| Game | 🥚 Hatchling | 🦖 Explorer | 🦴 Paleontologist |
| --- | --- | --- | --- |
| Skeleton (LAB-270, `skeleton-levels.md`) | today's game: four pieces, the right way up, on a full outline | 6–8 pieces, coloured by body area, help in steps | 10–12 pieces, a partial outline, distractor bones, pieces to turn; later, mystery skeleton (LAB-284) and odd bone out (LAB-285) |
| Find the pair (LAB-296) | today's game: 3 to 6 pairs, picture to picture, then to silhouette | 18 cards, picture to silhouette | 24 cards, picture to silhouette; to skeleton once the art covers 12 dinosaurs (LAB-301) |
| Care (LAB-294) | today's game: need bubbles and the matching item | one-step missions | the reasoning puzzle of LAB-281 |
| Sorting (LAB-295) | today's game: 2 baskets, 6 cards, every property | 8 cards; diet adds BOTH | 10 cards, legs or feathers, with TWO OR FOUR or NOT KNOWN YET |
| Quiz (LAB-274) | today's game: heavier or taller, at a gap of 1.5 times or more | adds longer | adds lighter and shorter, then earlier or later |
| Reading (LAB-273) | the first letter, with a picture cue | the missing letter, from 3 tiles | the name built from shuffled letters |
| Dig (LAB-335, `dig-levels.md`) | brush the sand off a dinosaur; the last grains blow away at 70% | find 3 details shown on cards, in any order | follow 3 clues one at a time, then name the dinosaur from 3 pictures |
