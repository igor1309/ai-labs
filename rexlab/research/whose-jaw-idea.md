# Whose Jaw? (Чья челюсть?): game idea

The agreed idea for the game (LAB-701), approved by the owner on 2026-10-28. It is the oracle for design and mechanics (LAB-703).

## Agreed idea (Igor, 2026-10-28)

**WHOSE JAW? / ЧЬЯ ЧЕЛЮСТЬ?** is a RexLab game for ages 5–7 on iPad, in EN/RU. Each dinosaur on screen has an empty, gummy mouth. The child gives the loose jaw back to its owner and learns that **teeth tell what an animal eats**.

- **Round:** 5 jaws, about 60 s. 5 empty tooth-sockets show progress.
- **Right answer:** the jaw snaps in, the dinosaur chomps its food and walks off.
- **Wrong answer:** a funny reaction shows why, for example a plant-eater pricks its tongue on sharp teeth. The jaw slides back and nothing is lost.
- **Reward:** a Jaw shelf in the MUSEUM. Tapping a jaw there plays its chomp.
- **Levels:**
  - 🥚 2 opposite dinosaurs, with the food shown next to each.
  - 🦖 3 dinosaurs, no food hint.
  - 🦴 4 close look-alikes (e.g. tyrannosaurus/allosaurus, triceratops/edmontosaurus), with real names and a one-line fact.
- **Strong round:** all 5 jaws placed with at most one wrong try.

### Decisions
- **Existing dinosaurs only:** the roster in `rexlab/src/data/dinosaurs.json`, using its `diet`. No modern animals. Dinosaurs whose diet is "both" are left out of 🥚.
- **No mystery sand jaw.**
- **Input:** both drag and tap-tap.
- **New content:** one jaw style prompt in `art/style.md`, plus a jaw and a gummy-mouth state for each dinosaur used.
