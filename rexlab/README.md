# RexLab

A dinosaur learning web app for children aged 5–7, played on an iPad and
served at https://rexlab.enoa.ai.

Activities include comparison, memory, sorting, skeleton assembly, digging,
care, sand writing, labyrinths, picture puzzles, jaw matching and coloring.
The app is in English and Russian, with child-facing text in capitals and
light and dark themes.

- [Games and approaches](docs/games.md): current activities, levels, rewards,
  replay and planned work, with links to detailed rules and designs.
- Behaviour: `docs/features/` (Gherkin).
- Architecture: `docs/mvp-infrastructure.md`.
- Dinosaur pictures: `art/style.md`.
- Running it locally, commands and releases: `AGENTS.md`.

For the board's browser geometry checks, run `npx playwright install chromium`
once, then `npm run test:browser` from `rexlab/`. The check starts and closes
its own Vite server and browser, and prints a unique temporary directory for
screenshots. It checks 60 reduced-motion configurations and one normal-motion
outward walk. Set `CHROME_PATH` to use a local Chrome executable, or `BOARD_URL`
to check an already running server instead. CI installs Chromium with its OS
dependencies and runs these checks on shard 1.

Run `node tests/nativeTouch.browser.cjs` for shared input protection, touch
scrolling, labyrinth taps and coloring drawing/navigation in Chromium with
iPhone/iPad portrait and landscape emulation. The check routes a production
build in memory and closes its own browser. It cannot verify native Safari
selection handles or callouts; those require physical devices. On iPhone and
iPad Safari in both orientations, repeat double taps and long presses on
text, pictures, canvas and controls; verify no selection or callout, then
scroll, pinch zoom, draw again, undo, navigate away and return.

The coloring workshop is an exported screen for the coloring flow. Construct
`coloringWorkshopRoot(indexedDB, document)` once, then await `newWork(id,
onNavigate, geometryVersion)` with a fresh identity or `open(id, onNavigate)` for a saved work.
Omitting the geometry version creates a Stegosaurus; the root's `artworks` offers
Stegosaurus, Triceratops, Ankylosaurus and T-Rex with localized names and matching preview geometry.
The T-Rex workshop versions are `trex-hatchling-1` and `trex-explorer-1`:
the first has broad animal regions, ground and a three-leaf plant; the second
adds belly and body markings, a cycad, sun, cloud, hills, ridge and rock.
The gallery offers exactly one T-Rex: simple at Hatchling, rich at Explorer
and Paleontologist. Saved drawings keep their original geometry after age
changes, including when NEW WORK starts another drawing from the workshop
or result. Each drawing has its own paint, undo history, thumbnail and star.
Render `ColoringWorkshopScreen` with that session, `painterFor(work.geometry)`,
the chosen dinosaur name and `language`. It follows the document's `data-theme` and the app's shared motion
and tap filter. The navigation callback receives `home`, `gallery`, `new` or
`result` and the durable work; `result` follows successful completion only.
The `result` navigation also includes the transaction's saved collection count
and whether this completion earned a star. `ColoringGame` composes gallery,
workshop and result from that root's `artworks`, `painterFor` and storage source, with `identity`, `countStart`, `home` and
`language` supplied by its host. Result EDIT reopens the durable history.
Await `session.settled()` before closing the root's storage connection. Opening
fails visibly to the caller when storage or reward history is unreadable.

For workshop browser checks, run `node tests/coloringWorkshop.browser.cjs`
from `rexlab/` after installing Chromium. It builds its own screen harness,
uses real Canvas and IndexedDB, and checks drawing, restore, interruption,
save errors and responsive layouts without a development server.

Run `node tests/coloringPainter.browser.cjs` for real raster checks, including
every T-Rex fill, protected ink and eye highlights, clipped brush paint and
minimum visible areas and solid interior patches. It saves unpainted and
painted screenshots of both scenes at four tablet landscape sizes in
`/tmp/lab-889/browser` (override with `TREX_SCREENSHOTS`). On hosts that cannot
launch Chromium child processes, set `CHROMIUM_SINGLE_PROCESS=1` to use its
single-process renderer.

Run `node tests/coloringResult.browser.cjs` for result paint, animation,
atomic completion abort/retry, repeat rewards, actions and responsive layouts.


Run `node tests/coloringGallery.browser.cjs` for gallery previews, independent
saved works, brush/fill/undo, cross-age restoration, thumbnails and one-time
completion rewards. Set `COLORING_ARTIFACT_DIR` to choose the workshop screenshot
directory. `node tests/coloringFlow.browser.cjs` checks the production Home route,
including all four choices and T-Rex at 1180 × 820 and 1024 × 768 across the three
age levels, both languages and themes.
