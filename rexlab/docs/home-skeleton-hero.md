# Skeleton hero: decisions and working guide

Recorded 2026-11-05 from LAB-1003, issue
`01a1abb4-bc63-7f08-b724-9b4c41f7b4f9`. This is a curated decision history
and continuation guide, not a verbatim transcript. Igor approved the final
appearance; landing and release remain separate work.

## Read this before changing the hero

The accepted result is a coherent standing T. rex assembled from a pile of
bones, with its head raised, light matte ivory bones and a transparent canvas.
After assembly it holds briefly, makes one smoothly eased 360-degree turn,
and rests in its three-quarter pose. It stands directly against the Home sky,
without the bright circle or halo used behind other featured games.

The accepted model deliberately combines a procedural body with a realistic
head extracted from an existing project scan. Do not replace the body with
scan fragments in pursuit of surface detail. Preserve the stance, proportions,
neck connection, materials and timing when changing a single requested part.
This is a stylized game illustration, not a validated anatomical reconstruction.

## What happened and what was approved

All events below occurred on 2026-11-05. Order matters more than exact times.

| Stage | Feedback or decision | Lesson carried forward |
| --- | --- | --- |
| Initial scope | Scope approval was given for a skeleton hero. | Scope approval did not approve an unseen visual result. |
| Early previews | The skeleton needed to compose itself from a pile of bones; a static skeleton or gentle yaw missed the point. | Demonstrate the game action, not merely a 3D asset. |
| Full turn | Igor requested a 360-degree turn, then rejected abrupt starts and stops. | Use smooth acceleration and deceleration, with holds before and after. |
| Detail improvements | The early standing model read clearly but looked toy-like, especially its skull. | Improve the requested detail while preserving the readable pose. |
| Scan remake | Naturalis Trix print sections were assembled by eye. Igor called the result stretched and broken. | Detailed surfaces cannot compensate for disconnected anatomy and bad posing. |
| Repeated pose patches | Raising the head and torso still left bad legs and a neck joining the body center. Repeated tail fragments used as neck vertebrae made matters worse. | Stop patching an invalid reconstruction; recover the last coherent baseline. |
| Mistaken blocker | The agent suggested acquiring another model despite assets and working previews already being available. Igor corrected this. | Inventory the repository and preserved work before declaring an asset missing or proposing a purchase. |
| Body recovery | The early coherent body was restored, with lighter matte bones, smaller joint bulges, a flatter skull and transparent background. Igor: “Very good.” | This became the approved body baseline. |
| Surgical head change | Igor explicitly requested only a more realistic head from project assets. The scanned skull and jaw were fitted to the existing neck as one piece. Igor: “Excellent!!” | The head replacement was approved; the body was not reopened for redesign. |
| Hero integration | Igor approved the assembly/hold/turn/rest proposal and requested a running preview on the local network. | Integrate the approved scene and validate it in the real Home layout. |
| Background correction | The light circle and halo behind the model washed out its presentation. They were removed only for the skeleton hero. Igor: “good”. | Review the complete composition in both themes, not just an isolated transparent render. |
| Knowledge capture | Igor requested this reusable record before landing. | Preserve decisions and known failures alongside the implementation. |

The upright reference meant a standing animal with planted feet and raised
head, rather than a running silhouette. Its neck must read as joining the
front of the spine above the ribcage, not emerging from the ribcage center.
Those requirements remain important even though the body is stylized.

## Accepted playback and interaction

- On each Home visit, assemble the bones in about five seconds; hold until
  second six; turn once between seconds six and fourteen; then stop rendering
  continuously. The standalone review export was twenty seconds long; the
  integrated hero intentionally uses a fourteen-second sequence.
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

## Assets and implementation to preserve

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
and a small assembly arc. The final asset is the durable approved geometry;
preserve it before any edit. Standalone generation/export scripts from this
session remain workspace-local under `skeleton-review/`; a fresh checkout
does not contain a supported end-to-end regeneration command. Do not assume
those temporary scripts or their dependencies will be available later.

For provenance, the head was selected from the existing scan's positive-X
end (triangles with all vertices above X=3.95). An adjacent fragment was
removed using centroid X<4.3 and Y>1.32. The selection was centered, turned
around Y by pi, uniformly scaled by 1.65, rotated around Z by -0.20 and
positioned near (-3.55, 4, 0) in the original preview scene. These coordinates
describe that source coordinate system; they are not a universal head-fitting
algorithm. Preserve the fitted exported head unless a new change is requested.

The head derives from Rigsters' Knuthenborg replica scan, under CC BY 4.0:
https://sketchfab.com/3d-models/tyrannosaurus-rex-skeleton-77e21c4e5d65468bbe11780ae0557b95
and https://creativecommons.org/licenses/by/4.0/. The head was extracted,
trimmed, scaled, rotated and recolored. No purchased replacement is needed.

## A safer workflow for the next visual change

1. Inventory existing assets and inspect the running accepted scene. Save an
   untouched baseline and capture the relevant views before editing.
2. State the specific requested difference. Change only that part; do not
   combine a head improvement with a body, pose, lighting or camera redesign.
3. Inspect side and three-quarter stills first. Check neck attachment,
   planted feet, silhouette, proportions and head fit before a long render.
   A polished material must not conceal a broken connection.
4. Watch the actual motion, including the pile, assembly joins, turn start,
   side/rear angles and turn finish. Passing geometry tests does not establish
   that the motion looks good.
5. Check the real Home composition in light and dark, landscape and portrait.
   Transparent export alone does not reveal a conflicting background element.
6. Attach fresh running-app evidence and describe exactly what changed.
   Separate a standalone render, a working local preview and a shipped release
   in the report. Obtain any required visual approval before landing.
7. If a revision breaks the approved structure, restore the baseline and
   narrow the edit. Do not repeatedly patch a new reconstruction or declare
   missing assets without checking the repository.

## Verification and delivery record

Implementation commits before this document were `c6a5109e4` (approved scene
integration) and `35db2d068` (remove the skeleton's sky circle). These are
historical checkpoints, not a claim that the branch is merged or released.

Recorded checks: typecheck and production build passed; the browser contract
passed with 33 layout/age/theme screenshots, covering loading, fallback,
context loss, resizing and navigation. The full unit run initially found two
stale fallback-path expectations; after correcting them, the affected Home
and hero suites passed all 87 tests. After circle removal those same 87 tests
passed again and fresh light/dark screenshots confirmed the circle was absent.
These are past results; rerun checks appropriate to future changes.

Useful commands from `rexlab/`:

```sh
npm run typecheck
npx vitest run tests/home.test.tsx tests/homeSkeletonHero.test.tsx tests/skeletonHeroScene.test.ts
npm run build
REXLAB_APP_BUILD=dist node tests/homeSkeletonHero.browser.cjs
npm run dev -- --host 0.0.0.0
```

The session's dedicated preview at `http://192.168.1.20:5176/?preview=skeletons`
uses a workspace-local Vite wrapper to select the skeleton featured game.
That query parameter is not a production application feature. The server is
best effort while the Mac stays awake, not permanent hosting. Its recorded
PID was 35742, with logs in `skeleton-review/lan-server.log` and a cleanup
handle in `skeleton-review/lan-server.json`. Recheck process identity before
stopping it; PIDs and LAN addresses can change.

Latest accepted light/dark evidence is attached to the issue comment
`01a1acdb-a742-7bed-b583-ac49b6dcf3b0`. The earlier running-app video still
contains the subsequently removed circle; do not treat it as the latest
background reference.

At capture time the issue remains in progress. The local appearance approval
does not substitute for current CI: the existing PR #1604 had an earlier
infrastructure failure, and these local implementation commits had not been
pushed. Before landing, complete required reviews and release criteria, push
the final branch and verify the required `report` check passes with nothing
pending or failing. Merge and tagged release are separate actions; this
documentation request itself authorizes neither.
