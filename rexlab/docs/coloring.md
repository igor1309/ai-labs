# Coloring workshop

How the coloring game is put together and checked. What the child sees and
does is in `games.md` § Color a dinosaur and the `coloring-*.feature` files.

## The workshop root

The coloring workshop is an exported screen for the coloring flow. Construct
`coloringWorkshopRoot(indexedDB, document)` once, then await `newWork(id,
onNavigate, geometryVersion)` with a fresh identity or `open(id, onNavigate)` for a saved work.
Omitting the geometry version creates a Stegosaurus. The root's `artworks`
(`src/coloring/artworks.ts`) lists every geometry with its localized name and
preview: each creature's current Hatchling and Explorer scenes, plus older
Explorer versions kept so saved works still open. The gallery offers one of
each creature: its Hatchling scene at Hatchling, its Explorer scene at
Explorer and Paleontologist. Saved drawings keep their original geometry after age
changes, including when NEW WORK starts another drawing from the workshop
or result. Each drawing has its own paint, undo history, thumbnail and star.
Render `ColoringWorkshopScreen` with that session, `painterFor(work.geometry)`,
the chosen dinosaur name and `language`. It follows the document's `data-theme` and the app's shared motion
and tap filter. The navigation callback receives `home`, `gallery`, `new` or
`result` and the durable work; `result` follows successful completion only.
The `result` navigation also includes the transaction's saved collection count
and whether this completion earned a star. `ColoringGame` composes gallery,
workshop and result from that root's `artworks`, `painterFor` and storage source, with `identity`, `countStart`, `home`,
`language` and `layout` supplied by its host. Result EDIT reopens the durable history.
Await `session.settled()` before closing the root's storage connection. Opening
fails visibly to the caller when storage or reward history is unreadable.

## Browser checks

Run these from `rexlab/` after `npx playwright install chromium`.

For workshop browser checks, run `node tests/coloringWorkshop.browser.cjs`
from `rexlab/` after installing Chromium. It builds its own screen harness,
uses real Canvas and IndexedDB, and checks drawing, restore, interruption,
save errors and responsive layouts without a development server.

Run `node tests/coloringPainter.browser.cjs` for real raster checks, including
every T-Rex fill, protected ink and eye highlights, clipped brush paint and
minimum visible areas and solid interior patches. It saves unpainted and
painted screenshots of both scenes at four tablet landscape sizes in
`TREX_SCREENSHOTS` (default `/tmp/rexlab-trex/browser`). On hosts that cannot
launch Chromium child processes, set `CHROMIUM_SINGLE_PROCESS=1` to use its
single-process renderer.

Run `node tests/coloringResult.browser.cjs` for result paint, animation,
atomic completion abort/retry, repeat rewards, actions and responsive layouts.

Run `node tests/coloringGallery.browser.cjs` for gallery previews, independent
saved works, brush/fill/undo, cross-age restoration, thumbnails and one-time
completion rewards. Set `COLORING_ARTIFACT_DIR` to choose the workshop screenshot
directory. `node tests/coloringFlow.browser.cjs` checks the production Home route,
including Stegosaurus, Triceratops, Ankylosaurus and T-Rex at 1180 × 820 and 1024 × 768 across the three
age levels, both languages and themes.
