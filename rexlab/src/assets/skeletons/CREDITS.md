# Skeleton picture credits

Each skeleton, `<id>/skeleton.webp`, was generated with Codex image generation (OpenAI) on 2026-10-18, traced from `../dinos/<id>/body.webp` in the same pose and 800×600 framing, so the body picture lies exactly over it. Its pieces, `<id>/skull.webp`, `spine.webp`, `legs.webp` and `tail.webp`, are cut from it along the bones; `src/data/skeletons.json` gives each piece's place in the 800×600 frame.

Explorer's pieces (`docs/skeleton-levels.md`), six to eight per skeleton, are cut on 2026-10-19 by script from the same Hatchling pieces along the body areas (head, neck, back, hips, legs, tail), with no new picture generated: a piece Hatchling's cut already has whole, such as a skull or a tail, is the same file. `src/data/skeletons.json` gives each Explorer piece's place and body area.
