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

## Rules

- **No scale cues.** Every dinosaur fills its frame the same way, whatever
  its real size: the question asks which is heavier or taller, and the
  revealed values answer it, never the picture.
- **Feathers where science says so:** Velociraptor, Microraptor,
  Deinonychus, Oviraptor, Therizinosaurus, Utahraptor, Yutyrannus,
  Archaeopteryx and Troodon are feathered.
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
