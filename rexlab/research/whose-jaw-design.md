---
date: 2026-10-28
model: claude-opus-5-5
description: "Design and game mechanics for Whose Jaw? (Чья челюсть?), LAB-703, built on whose-jaw-idea.md."
---

# Whose Jaw? (Чья челюсть?): design and mechanics

This doc builds on `whose-jaw-idea.md` (the oracle, approved by Igor on
2026-10-28). Where the oracle is silent, this doc makes a choice and marks
it **[choice]**. Where a choice stretches what the oracle says, it is marked
**[flag]** and listed under "For Igor" at the end. It follows the product
principles in `../AGENTS.md`, the levels in `../docs/age-levels.md` and
double-tap safety in `../docs/tap-safety.md`.

## Core idea

Teeth tell what an animal eats. Each dinosaur on screen has an empty, gummy
mouth, and the child gives the loose jaw back to its owner. The rule the
child learns is: **sharp, pointed teeth mean MEAT, and flat, leaf-shaped
teeth or a beak mean PLANTS.** At 🦴 the child goes one step further: jaws
from the same diet still differ in shape.

## Roster

- Only dinosaurs from `src/data/dinosaurs.json` with `group: "dinosaur"`.
  Flying and sea reptiles stay out, because the game says "dinosaur" **[flag]**.
- `diet` decides right and wrong at 🥚 and 🦖. At 🦴, a jaw belongs to
  exactly one dinosaur (its `id`).
- `diet: "both"` (gallimimus, oviraptor, troodon) is left out of 🥚, as the
  oracle says. It can appear at 🦖 and 🦴 only as an owner whose jaw is
  shown on its own, never as a choice that a diet rule has to decide
  **[choice]**: a "both" jaw is never put next to a meat-eater and a
  plant-eater where either answer could look right.
- First release, 12 dinosaurs with jaws **[choice]**: enough for every level
  and few enough for the art budget:

| Pair (for 🦴) | Dinosaur A | Dinosaur B | Tooth cue |
| --- | --- | --- | --- |
| big hunters | tyrannosaurus | allosaurus | thick "banana" teeth vs thin, blade-like teeth |
| horned / duck-bill | triceratops | edmontosaurus | beak with shearing cheek teeth vs duck beak with a "tooth pavement" |
| raptors | velociraptor | deinonychus | small hooked teeth in a long, narrow snout vs a shorter, deeper snout |
| long necks | diplodocus | brachiosaurus | pencil-like front teeth vs spoon-shaped teeth |
| plated / armoured | stegosaurus | ankylosaurus | tiny leaf teeth in a long narrow head vs tiny leaf teeth in a wide, armoured head |
| fish / sail | spinosaurus | baryonyx | straight cone teeth in a crocodile snout vs a snout with a kink and more teeth |

Every pair shares one diet, so at 🦴 the shape, not the diet, decides. Each
fact goes through `../docs/sources.md` before it ships.

## Screens and states

The game follows RexLab's usual welcome, board and result screens, plus a
new MUSEUM shelf.

### 1. Welcome

- Title "WHOSE JAW? / ЧЬЯ ЧЕЛЮСТЬ?" with a 🦷 picture, and a jaw that chomps
  twice when the screen arrives.
- A level switch (🥚 🦖 🦴) that starts at the age level and remembers the
  child's choice, as in other games.
- A big PLAY ▶ button and a 🏛 JAW SHELF button.
- The best score for this level, a small badge with 🦷 and a number.
- States: first visit (no best, empty shelf hint "0 / 12"), returning
  (best and shelf count).

### 2. Board (one round)

Layout, landscape iPad:

- **Top:** a progress bar of 5 empty tooth-sockets. A placed jaw fills its
  socket with a white tooth. A tooth placed on the first try shines.
- **Middle:** a row of 2, 3 or 4 dinosaurs, depending on the level. Each one
  stands with its mouth slightly open and gummy (no teeth). At 🥚 its food
  (a steak 🥩 or a leafy branch 🌿) floats beside it.
- **Bottom:** a tray holding the loose jaw, big (at least 160 px across),
  with a gentle wiggle every 4 s while untouched to invite a touch.
- **Corner:** a home/close button, guarded as in other games.

Board states:

| State | What shows |
| --- | --- |
| `entering` | dinosaurs walk in from the side, the jaw drops into the tray |
| `waiting` | the jaw wiggles, dinosaurs blink and breathe |
| `holding` | the jaw follows the finger (drag) or glows as picked (tap) and each dinosaur's mouth opens wider |
| `right` | snap, chomp, walk-off (below) |
| `wrong` | funny reaction, then the jaw slides back to the tray |
| `next` | new dinosaurs walk in (the right one has left, the others step aside) |
| `done` | after the 5th jaw, all 5 teeth shine and the result follows |

### 3. Result

- Stars for the round (see Scoring), a pile of the 5 jaws placed,
  "NEW BEST!" celebration when it is one.
- A jaw newly added to the shelf flies onto a small shelf picture.
- PLAY AGAIN 🔁, JAW SHELF 🏛 and HOME 🏠 buttons.
- The level-offer card (LAB-293) appears here after strong rounds.

### 4. MUSEUM: Jaw shelf

- A wooden shelf with 12 places, in 3 rows of 4, one place per dinosaur
  with a jaw. Each shelf is labelled with a diet picture, 🥩 or 🌿.
- A won jaw stands on its place with the dinosaur's name in capitals
  under it. An unwon place shows a faint outline of the jaw and a "?".
- **Tap a jaw:** it chomps twice with its own sound, and a card rises
  with the dinosaur's picture, its name (read aloud), 🥩 or 🌿, and the
  one-line jaw fact. Tap anywhere else to close.
- It is reached from the Welcome screen and from the home MUSEUM, next to
  the skeleton stands.
- A jaw is added the first time the child places it right, at any level
  **[choice]**. This follows "Same rewards" in `age-levels.md`.

## Round flow

1. The round picks 5 jaws for the level (rules below). No jaw repeats
   within a round.
2. For each jaw: the dinosaurs walk in, and the jaw appears in the tray.
3. The child moves the jaw to a dinosaur (Input).
4. Right: the socket fills, then the next jaw. Wrong: a reaction, the jaw
   goes back to the tray, and the child tries again with the same set.
   Nothing is lost; the try is only counted.
5. After 2 wrong tries on the same jaw, the right dinosaur's mouth glows
   and opens wide (a hint) **[choice]**, so a round never gets stuck. At 🥚
   the food beside the owner also bounces.
6. After the 5th jaw, the Result screen follows.

A round runs about 60 s with no timer on screen and no time pressure
**[choice]**: "about 60 s" is how long it takes, not a limit.

### Picking the jaws and dinosaurs

| Level | Dinosaurs on screen | How they are chosen |
| --- | --- | --- |
| 🥚 | 2 | one meat-eater and one plant-eater; the jaw belongs to one of them; no "both" |
| 🦖 | 3 | the jaw's owner plus 2 others, at least one of the opposite diet; the others have no jaw of the same diet that could also fit **[choice]** |
| 🦴 | 4 | the jaw's owner, its look-alike partner from the table, plus 2 more from another pair; all 4 can share one diet |

At 🥚 and 🦖, a jaw is right on any dinosaur of its diet that is on screen,
but the board never shows two of the same diet with it, so only one
answer is ever right **[choice]**. At 🦴, only the owner is right.

## Scoring

- **Teeth (in-round score):** 5 sockets, one per jaw.
- **Stars (round result) [choice]:** 3 ⭐ for 0 wrong tries, 2 ⭐ for 1, 1 ⭐
  for 2 or more. A finished round always earns at least one star.
- **Best score:** the most stars in one round at this level, as in other
  games. A best belongs to its level.
- **Strong round (oracle):** all 5 jaws placed with at most one wrong try,
  which is 2 or 3 stars. Three strong rounds in a row show the level offer.
  🦴 offers nothing.
- No words ever say a round went badly.

## Levels

| Level | On screen | Help | Extra |
| --- | --- | --- | --- |
| 🥚 Hatchling | 2 opposite dinosaurs | food shown next to each | the jaw's own diet picture shows only on the hint |
| 🦖 Explorer | 3 dinosaurs | no food | dinosaur names are read aloud when tapped (no move) |
| 🦴 Paleontologist | 4 close look-alikes | no food | real names under each dinosaur; after a right answer, a one-line fact about this jaw |

🥚 is the easiest mode a 4-year-old can play (Demote, never delete).

## Feedback

### Right answer

1. The jaw snaps into the mouth (≈150 ms, an ease-out with a small
   overshoot) with a "click".
2. The dinosaur chomps its food: a steak or a branch appears and is eaten
   in 2 bites with a crunch sound (≈700 ms). At 🦴, the jaw fact appears in
   a speech bubble and is read aloud.
3. The dinosaur walks off happily (≈500 ms), and its socket fills with a
   tooth that flies to the progress bar.

### Wrong answer

The dinosaur tries the jaw, a funny reaction shows why, and the jaw slides
back to the tray (≈1.2 s total). No sound of failure, no lost tooth.

| Jaw → dinosaur | Reaction |
| --- | --- |
| meat jaw → plant-eater | it bites a leaf, pricks its tongue on the sharp teeth, "OW!", and spits the jaw out |
| plant jaw → meat-eater | it bites a steak, the flat teeth just squish it, it looks puzzled, "HMM?" |
| same diet, wrong owner (🦴) | the jaw is too big or too small: it hangs loose or will not close, the dinosaur shrugs and a one-line hint names the cue, e.g. "MY TEETH ARE THICKER!" |

All words are in capitals, short, read aloud in EN/RU, and come with a
picture (🌿, 🥩, 📏).

### Reduced motion

Every animation falls back to a short fade. The snap becomes a fade-in of
the jaw in the mouth, the walk-off a fade-out, the wrong reaction a still
picture of the reaction for 800 ms, then the jaw fades back to the tray.

## Input

Both drag and tap-tap work all the time; the child never chooses a mode.

- **Drag:** touch the jaw, move, release over a dinosaur. The drop zone is
  the whole dinosaur plus a 40 px margin, never smaller than 200×200 px.
  The dinosaur under the finger leans in and opens wide. A release outside
  any zone slides the jaw back, with no wrong try counted.
- **Tap-tap:** tap the jaw (it lifts and glows), then tap a dinosaur. A
  tap on the jaw again, or on empty space, puts it down. A tap on a
  dinosaur first, with no jaw picked, only plays its name.
- **Double-tap safety:** a quick double tap is one tap
  (`../docs/tap-safety.md`). Taps are ignored while an answer plays out,
  so a second tap never lands on the next set of dinosaurs.
- **One finger:** a second finger is ignored while the jaw is held.
- **Keyboard (accessibility):** arrows move between dinosaurs, Space or
  Enter picks up and places the jaw. Each dinosaur has a name for screen
  readers.
- Only a drop or a second tap on a dinosaur counts as a try.

## Required assets

Art (style follows `../art/style.md`):

1. **Jaw style prompt**: one new section in `art/style.md` for jaws: a
   cartoon, ivory jaw, a side view, with clear, big teeth whose shape
   reads at a glance (sharp vs flat).
2. **12 jaws**: one per dinosaur in the roster, on a transparent
   background, at 1x/2x/3x.
3. **12 gummy-mouth states**: each dinosaur with its mouth slightly open
   and no teeth, matching its existing picture.
4. **12 mouth-with-jaw (closed) states**: for the snap and chomp
   **[choice]**. These may be made as the jaw layered on the gummy state
   if that looks right; then they are not needed.
5. **Food**: a steak and a leafy branch, each with a "bitten" frame.
6. **Reactions**: tongue-prick ("OW!") and squish ("HMM?") overlays, and a
   loose/too-big overlay for 🦴.
7. **Jaw shelf**: shelf background, an empty-place outline, a "?" mark.
8. **Icons**: 🦷 game tile and the tooth-socket (empty, filled, shining).

Sound:

- snap click, chomp crunch (one shared, plus a pitch per jaw on the
  shelf), "OW!", "HMM?", walk-off steps, a gentle tray slide.

Text (EN and RU, capitals):

- Game title, button labels, the reaction lines, and for each of the 12
  dinosaurs a one-line jaw fact and a 🦴 hint line. All facts are checked
  against `../docs/sources.md`.

## For Igor

These are the places where the doc goes beyond the oracle. Please confirm
them in LAB-704 or change them:

1. **Dinosaurs only:** flying and sea reptiles are left out, even though
   they are in `dinosaurs.json`.
2. **12-dinosaur first release**, in 6 look-alike pairs. The oracle's
   example triceratops/edmontosaurus is a pair here.
3. **🦴 is decided by shape, not diet:** look-alikes such as
   tyrannosaurus/allosaurus share one diet, so the wrong-answer reaction
   there is "does not fit", not a diet joke.
4. **Stars:** 3/2/1 for 0/1/2+ wrong tries, and no timer.
5. **Hint after 2 wrong tries** on one jaw.
