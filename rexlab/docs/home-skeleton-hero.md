# Skeleton hero

The Home hero for the skeleton game: a standing T. rex assembled from a pile
of bones, with its head raised, light matte ivory bones and a transparent
canvas. After assembly it holds briefly, makes one smoothly eased 360-degree
turn and rests in its three-quarter pose. It stands directly against the Home
sky, without the bright circle or halo behind other featured games.

## Rules for changing it

- The model combines a procedural body with a realistic head taken from a
  scan already in the project. Do not rebuild the body from scan fragments
  for surface detail: disconnected anatomy reads as stretched and broken,
  however detailed.
- Change only the part asked for. Keep the stance, proportions, neck joint,
  materials and timing; a new head does not reopen the body. The bones are
  light and matte with small joint bulges and a flat skull; the scanned
  skull and jaw fit the neck as one piece. Tail fragments are never used as
  neck vertebrae.
- It is a standing animal with planted feet and a raised head, not a running
  silhouette. The neck joins the front of the spine above the ribcage, not
  the ribcage centre.
- The turn starts and stops with smooth easing and holds before and after;
  an abrupt start or stop is a defect.
- It is a stylized game illustration, not a validated anatomical
  reconstruction.
- Check the repository's assets and any saved previews before calling one
  missing; no purchased model is needed.
- Approving the scope of a change does not approve a result nobody has seen.

## Playback and interaction

- On each Home visit, assemble the bones in about five seconds; hold until
  second six; turn once between seconds six and fourteen; then stop rendering
  continuously.
- Use uniform framing across viewport sizes. Fit skull, feet and tail during
  the pile, assembly and every angle of the turn. Do not stretch the skeleton
  horizontally to fill the hero.
- Keep the title, PLAY and saved progress visible. PLAY and tapping the
  artwork work immediately, including during loading and animation.
- Pause playback while hidden or outside the viewport; resume the retained
  phase. Resizing redraws without replaying the entrance.
- Reduced motion shows the complete standing pose. Enabling it midway finishes
  the pose; disabling it again does not restart that Home visit's animation.
- Loading failure, unavailable WebGL or context loss shows the approved still.
  Context loss stays on that fallback until a new Home visit.
- All three age levels share this decorative animation. Other featured games
  keep their own artwork and sky circle.

## Assets and implementation

Paths below are relative to `rexlab/` and identify editable implementation,
not additional requirements hidden elsewhere.

| File | Purpose |
| --- | --- |
| `src/assets/home/skeleton-hero/assembly.glb` | Shipped scene: 104 bone groups, procedural body plus extracted scanned head, assembly metadata, shared geometry, about 630 KB, no external resources. |
| `src/assets/home/skeleton-hero/standing.png` | Transparent completed-pose fallback from the approved scene. |
| `src/assets/home/skeleton-hero/tyrannosaurus.glb` | Existing complete scan used as the head source; not the approved assembly body. |
| `src/assets/home/skeleton-hero/CREDITS.md` | Source attribution and modification record. Retain these when deriving assets. |
| `src/skeletonHeroScene.ts` | Scene loading, lighting, framing, assembly transforms, eased turn and GPU disposal. |
| `src/homeSkeletonHero.ts` | Fourteen-second playback, visibility, reduced motion, fallback and component lifecycle. |
| `src/HomePage.tsx` | Home integration, still import and skeleton-only omission of the sky circle. |

Each bone group's `userData.assembly` stores `start`, `end`, `spin`, `at` and
`duration`. The renderer interpolates positions and rotations with easing
and a small assembly arc. The shipped asset is the approved geometry; keep
a copy before any edit. The repository has no command that regenerates it.

For provenance, the head was selected from the existing scan's positive-X
end (triangles with all vertices above X=3.95). An adjacent fragment was
removed using centroid X<4.3 and Y>1.32. The selection was centered, turned
around Y by pi, uniformly scaled by 1.65, rotated around Z by -0.20 and
positioned near (-3.55, 4, 0) in the source scene. These coordinates
describe that source coordinate system; they are not a universal head-fitting
algorithm. Keep the fitted head unless a change asks for a new one.

The head derives from Rigsters' Knuthenborg replica scan, under CC BY 4.0:
https://sketchfab.com/3d-models/tyrannosaurus-rex-skeleton-77e21c4e5d65468bbe11780ae0557b95
and https://creativecommons.org/licenses/by/4.0/. The head was extracted,
trimmed, scaled, rotated and recolored.

## Workflow for a visual change

1. Inspect the running scene and save an untouched baseline with the
   relevant views before editing.
2. State the one difference asked for, and change only that part.
3. Inspect side and three-quarter stills first: neck joint, planted feet,
   silhouette, proportions and head fit. A polished material must not hide
   a broken joint.
4. Watch the motion itself: the pile, assembly joins, turn start, side and
   rear angles and turn finish. Passing geometry tests do not show that the
   motion looks good.
5. Check the real Home screen in light and dark, landscape and portrait; a
   transparent export does not show a clashing background.
6. Report fresh screenshots from the running app and say whether they come
   from a standalone render, a local preview or a release, and say exactly
   what changed. Get visual
   approval before landing (`feature-process.md`).
7. If a change breaks the structure, restore the baseline and narrow the
   edit rather than patching a new reconstruction.

Checks, from `rexlab/`:

```sh
npm run typecheck
npx vitest run tests/home.test.tsx tests/homeSkeletonHero.test.tsx tests/skeletonHeroScene.test.ts
npm run build
REXLAB_APP_BUILD=dist node tests/homeSkeletonHero.browser.cjs
```
