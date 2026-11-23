# RexLab games

Start here to understand what each activity offers and where its rules live.
It describes what the repository builds, not a check of the deployed site
or of physical devices.

## Shared approach

Games use pictures, large dinosaur names and short uppercase child-facing
text in English and Russian. Difficulty comes from observation, memory and
reasoning rather than speed or punishment. Feedback is immediate and gentle;
motion uses shared tokens and respects reduced motion. Progress belongs to
each game and its Home presentations.

[Game design questions](game-design.md) guide goals, choices, reactions,
surprises, rewards and replay. [Age levels](age-levels.md) defines Hatchling
(about 4), Explorer (about 5) and Paleontologist (6+), the global default,
per-game choices and next-level offers. A harder mode preserves the easy one.
The entries below distinguish implemented modes from proposed ones.

## Current activities

### Compare

Choose which of two creatures matches a comparison, ten questions per round.
Hatchling asks heavier or taller; Explorer adds longer; Paleontologist also
asks lighter and shorter. Fair value gaps keep answers readable. Correct
answers earn score and stars, with best scores per level; varied pairs make
another round different.

Rules: [answer feedback](features/compare-dinosaurs-answer.feature),
[longer questions](features/compare-dinosaurs-longer.feature),
[result](features/compare-dinosaurs-result.feature).

### Find the pair

Turn cards to match creatures and remember their positions. Hatchling climbs
from 3 to 6 pairs, progressing from matching pictures to silhouettes. Explorer
uses 9 picture/silhouette pairs; Paleontologist uses 12 picture/skeleton pairs.
Finished boards earn stars and grow a creature collection; fewer tries improve
the best. Shuffled boards and the collection encourage replay.

Rules: [start](features/find-the-pair-start.feature),
[levels](features/find-the-pair-levels.feature),
[progress](features/find-the-pair-progress.feature).

### Sort

Put creature cards into baskets by a visible or factual property. Hatchling
uses 6 cards and two baskets; Explorer uses 8 cards and can add an omnivore
basket. Paleontologist uses 10 cards and tackles legs or feathers, including
ambiguous or scientifically unknown categories. Correct answers earn stars
and a per-level best; fresh cards and properties vary the next board.

Rules: [play](features/sort-dinosaurs-play.feature),
[levels](features/sort-dinosaurs-levels.feature),
[result](features/sort-dinosaurs-result.feature).

### Build a skeleton

Fit cut skeleton pieces, then reveal the living dinosaur and a fact.
Hatchling has 4 upright pieces on a full outline; Explorer has 6–8 pieces
with staged help; Paleontologist has 10–12 pieces, a partial outline,
distractor bones. Pieces stay upright. Five skeletons
fill museum stands; each earns one collection star, with higher-level badges
for finishing without the last help step. Once a skeleton has its star, mystery guessing
adds something to do.

Plan and rationale: [skeleton levels](skeleton-levels.md).
Rules: [start](features/skeleton-assembly-start.feature),
[museum](features/skeleton-assembly-museum.feature),
[mystery](features/skeleton-assembly-mystery.feature).

### Dig

Brush sand away with a finger to discover a creature. Hatchling freely
uncovers it, with the last sand blowing away at 95%. At Explorer and
Paleontologist, choices fade in from 10% uncovered and can be picked at 75%: identify the creature from
3 or 4 pictures. The board stays still while brushing. There is no timer or
penalty; help keeps the round moving. A creature's first dig earns its star
and increases DUG UP; repeat digs earn no new star. Occasional treasures fill the Field Guide; new finds
and look-alike choices vary replay.

Plan and rationale: [dig levels](dig-levels.md).
Rules: [brushing](features/dig-brush.feature),
[question](features/dig-question.feature),
[Field Guide](features/dig-field-guide.feature).

### Care

Welcome a dinosaur and meet four needs: food, water, bath and sleep. Picture
bubbles prompt the child to pick a suitable item, with gentle reactions and
another try after a mismatch. Each met need earns a heart, plus a first-choice
bonus; a finished visit records a best and adds a friend. Returning visitors
and the Friends collection support replay.

The integrated game is the need-bubble mode, used as the fallback for higher
age settings. Missions and hatch-and-grow experiments are prototypes or
proposals, not three completed difficulty modes.

Rules: [welcome](features/dinosaur-care-start.feature),
[hearts](features/dinosaur-care-hearts.feature),
[progress](features/dinosaur-care-progress.feature).

### Sand writing

Draw letters, numbers or figures freely in sand with a finger, Pencil or
mouse. Choose a fine tip or clear the sand. Every age setting uses the same
open toy: no recognition, questions, score, timer or prescribed sequence.
The groove itself is the feedback. Reopening starts fresh sand; the activity
does not promise a saved drawing collection.

Rules: [drawing](features/sand-writing.feature),
[Home flow](features/sand-writing-flow.feature).

### Labyrinth

Guide a baby dinosaur through a maze to its parent. Generated boards grow
from 9×7 to 15×9 to 17×11 across the three levels, with more decisions and
long wrong turns. Every reunion earns 3 stars, with a best per level and
a shared total. A round without hints counts toward a next-level offer.
Replay generates new walls; unfinished boards are not restored after reload.

Rules: [board](features/labyrinth-board.feature),
[full flow](features/labyrinth-flow.feature).

### Picture puzzle

Build a dinosaur picture by dragging pieces or tapping then placing them.
Choose Tyrannosaurus, Triceratops or Stegosaurus. Hatchling has 12 upright
pieces, Explorer 24 and Paleontologist 36. Completion reveals the creature
and a fact, earns a round star and marks the collection. Each level tracks
its distinct completed dinosaurs; Home shows the shared collection out of 3.
Replay reshuffles without duplicating a collected dinosaur.

Rules: [choice and levels](features/picture-puzzle-choice.feature),
[result](features/picture-puzzle-result.feature),
[full flow](features/picture-puzzle-flow.feature).

### Whose Jaw?

Return five different jaws to their owners by tapping or dragging.
Hatchling offers 2 creatures with food cues; Explorer offers 3 with diet-based
deduction; Paleontologist offers 4, including same-diet look-alikes, so jaw
shape decides. Hints, spoken names and facts support observation. Completing
a round earns 1–3 stars: 3 with no wrong tries, 2 with one, and 1 with two
or more. Collected jaws fill a sixteen-slot shelf with playful
chomps. Fresh rounds, best scores and the shelf support replay.

Rules: [board and levels](features/whose-jaw-board.feature),
[shelf](features/whose-jaw-shelf.feature),
[full flow](features/whose-jaw-flow.feature).

### Color a dinosaur

Paint inside protected outlines with brushes and fills, undo edits, and keep
independent editable works in a gallery. Hatchling uses each creature's
Hatchling scene, Explorer and Paleontologist its Explorer scene; there is no
level switch or promotion. Autosave retains editable
history. Each separate nonempty completed work earns one star once; the
collection count is the best, without judging artistic quality. Editing and
new works provide replay.

Coloring is integrated into Home in the current source. Its feature files
still carry `@next`, so those tags alone do not describe implementation
status here. This index does not declare every specified acceptance scenario
complete. The [technical probe](coloring-probe.md) describes an earlier,
isolated experiment, not the complete Home-integrated game; the
[coloring workshop](coloring.md) note describes how the game is composed.

Rules: [gallery](features/coloring-gallery.feature),
[gallery creatures](features/coloring-gallery-creatures.feature),
[workshop](features/coloring-workshop.feature),
[workshop tools](features/coloring-workshop-tools.feature),
[workshop scenes](features/coloring-workshop-scenes.feature),
[more workshop scenes](features/coloring-workshop-scenes-more.feature),
[result](features/coloring-result.feature),
[full flow](features/coloring-flow.feature),
[saved works](features/coloring-flow-saved.feature),
[creature age variants](features/coloring-flow-creatures.feature).

## Catalogue and planned work

The [creature catalogue](features/catalogue.feature) and individual creature
pages are reference activities, with food filters, pictures and facts rather
than game scores.

Reading with dinosaur names is planned: picture-cued first
letters, missing letters and shuffled names across the three levels. It is
not a current Home game. Care redesigns and further coloring creatures remain
separate work items; an issue proposal is not evidence of a shipped mode.
Skeleton excavation and odd-bone-out are not planned.

## Finding and maintaining the details

- [Behavior specs](features/) describe individual screens and full flows.
  `@next` generally marks planned behavior; check source integration and
  delivery records when tags lag, as noted for coloring above.
- [Visual designs](../design/rexlab.pen) hold screen frames and storyboards.
- [Architecture](mvp-infrastructure.md), [tap safety](tap-safety.md) and
  [art style](../art/style.md) explain implementation and asset conventions.
- [Change log](log.md) records deliveries. Issues preserve proposals,
  approvals, rejected alternatives and implementation tasks.

When a game or mode changes, update its entry here and its detailed rules
in the same change. Record accepted mechanics in the repo; keep discussion
and delivery tracking in issues. This index is a navigation aid, not a second
copy of every acceptance scenario.
