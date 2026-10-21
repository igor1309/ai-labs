# Skeleton picture credits

Each skeleton, `<id>/skeleton.webp`, was generated with Codex image generation (OpenAI) on 2026-10-18, traced from `../dinos/<id>/body.webp` in the same pose and 800×600 framing, so the body picture lies exactly over it. Its pieces, `<id>/skull.webp`, `spine.webp`, `legs.webp` and `tail.webp`, are cut from it along the bones; `src/data/skeletons.json` gives each piece's place in the 800×600 frame.

Explorer's pieces (`docs/skeleton-levels.md`), six to eight per skeleton, are cut on 2026-10-19 by script from the same Hatchling pieces along the body areas (head, neck, back, hips, legs, tail), with no new picture generated: a piece Hatchling's cut already has whole, such as a skull or a tail, is the same file. `src/data/skeletons.json` gives each Explorer piece's place and body area.

Paleontologist's pieces, ten to twelve per skeleton, are cut on 2026-10-19 by script from Explorer's pieces in the same way, again with no new picture generated. Its distractors, two or three bones of the other skeletons, are those skeletons' own Paleontologist pieces, named in `src/data/skeletons.json` with their dinosaur.

Brachiosaurus's and Spinosaurus's skeletons were generated the same way on 2026-10-19, with `scripts/skeleton-picture.sh`, and cut at every level by `scripts/cut-skeleton.py` on 2026-10-20.

Whole skeletons of Velociraptor, Ankylosaurus, Parasaurolophus, Pachycephalosaurus, Compsognathus, Gallimimus, Therizinosaurus, Pteranodon, Elasmosaurus and Mosasaurus were generated the same way on 2026-10-21, with `scripts/skeleton-picture.sh`, for FIND THE PAIR's Paleontologist board (LAB-385); they are not cut into pieces.

How to make and cut a skeleton: `art/skeletons.md`.
