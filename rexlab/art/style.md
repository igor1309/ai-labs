# RexLab dinosaur art

Every dinosaur picture is AI-generated to one style, so no picture stands
out or hints at an answer. `prompts.md` holds the prompt for each dinosaur;
generate with the style prompt below plus that line.

## Style prompt

> Children's picture-book illustration of a single dinosaur, full body,
> side view facing left, turned slightly toward the viewer, standing on
> nothing. Friendly and calm, eyes open, mouth closed or gently open, never
> scary or bloody. Flat bright colours with soft shading and a clean dark
> outline. Plain transparent background, no ground, no shadow, no plants, no
> other animals, no text. The dinosaur fills the frame edge to edge with a
> small even margin.

## Flying style prompt

For a flying reptile, a pterosaur, which is no dinosaur and no bird.

> Children's picture-book illustration of a single flying reptile, full
> body, side view facing left, turned slightly toward the viewer, gliding
> with its wings spread wide in empty space. Its body has fine short fuzz,
> never feathers. Friendly and calm, eyes open, mouth closed or gently
> open, never scary. Flat bright colours with soft shading and a clean
> dark outline. Plain flat solid pure magenta (#FF00FF) background, no
> ground, no sky, no shadow, no plants, no other animals, no text, and no
> magenta or pink anywhere on the animal.

## Sea style prompt

For a sea reptile, which is no dinosaur.

> Children's picture-book illustration of a single sea reptile, full body,
> side view facing left, turned slightly toward the viewer, swimming with
> its flippers spread. Friendly and calm, eyes open, mouth closed or
> gently open, never scary. Flat bright colours with soft shading and a
> clean dark outline. Plain flat solid pure magenta (#FF00FF) background,
> no water, no bubbles, no ground, no shadow, no plants, no other animals,
> no text, and no magenta or pink anywhere on the animal.

## Rules

- **No scale cues.** Every dinosaur fills its frame the same way, whatever
  its real size: the question asks which is heavier or taller, and the
  revealed values answer it, never the picture.
- **Feathers where science says so:** Velociraptor, Microraptor,
  Deinonychus, Oviraptor, Therizinosaurus, Utahraptor, Yutyrannus,
  Archaeopteryx and Troodon are feathered. Pterosaurs have fine fuzz,
  never feathers: whether it was a kind of feather is still argued.
- **Flying and sea reptiles** are made by `scripts/body-picture.sh`, which
  clears the magenta and frames each the same way as the dinosaurs.
- **Delivery:** 800×600 WebP with alpha, about 40–70 KB, at
  `src/assets/dinos/<id>/body.webp`, where `<id>` is the dinosaur's id in
  `src/data/dinosaurs.json`.
- **Credits:** record the generator and date for each picture in
  `CREDITS.md` beside the images.
- **Placeholders:** until a dinosaur's artwork exists, its picture is a
  placeholder with its name, made by `scripts/make-placeholders.sh`
  (ImageMagick and `cwebp`): run it with the dinosaur's id to make one,
  or with none to make every dinosaur's. A test checks that every
  dinosaur in the list has a picture of the agreed size, with alpha.

Skeletons, traced from these pictures and cut into pieces, follow
`skeletons.md`.

## Jaw style prompt

For Whose Jaw? (`research/whose-jaw-design.md`). One loose jaw per
dinosaur, made by `scripts/jaw-picture.sh`.

> Children's picture-book illustration of a single loose cartoon jaw on
> its own: the upper and lower jaw together, slightly open, side view
> facing left, no head, no skin, no eyes, no tongue. Ivory bone colour
> with soft shading and a clean dark outline. The teeth are big, white
> and clear, so their shape reads at a glance, never bloody or scary.
> Plain flat solid pure magenta (#FF00FF) background, no ground, no
> shadow, no other objects, no text, and no magenta or pink anywhere on
> the jaw.

## Gummy mouth prompt

The same dinosaur as its body picture, edited, never redrawn: the jaw
fits a mouth that matches the picture the child already knows.

> Edit the attached picture only around the mouth: the mouth is gently
> open and has pink gums and no teeth at all, friendly and a little
> funny. Keep everything else exactly the same: pose, colours, outline,
> framing and size. Plain flat solid pure magenta (#FF00FF) background,
> no magenta anywhere on the animal.

Jaws are delivered as 600×450 WebP with alpha at
`src/assets/jaws/<id>.webp` (the game draws them at 1x–3x from this one
file, as with the bodies), gummy mouths as 800×600 WebP with alpha at
`src/assets/dinos/<id>/gummy.webp`. Both are recorded in
`src/assets/jaws/CREDITS.md`.
