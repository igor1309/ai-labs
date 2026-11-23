# RexLab architecture

RexLab is a static web app: React, TypeScript and Vite, built to files and
served by Cloudflare Pages at https://rexlab.enoa.ai. There is no server,
database or account; every rule runs in the browser and progress stays on
the device.

## Hosting and releases

- Cloudflare Pages project `rexlab`, free tier, on the `enoa.ai` domain.
- Every pull request that touches RexLab's code runs `rexlab-core.yml`:
  typecheck, tests, build and the browser checks as a matrix. Docs-only
  changes run nothing. Merging deploys nothing.
- A `rexlab_v<version>` tag on trunk runs `release-unit.yml`, which checks
  the tag against `release-units.toml` and calls `rexlab-deploy.yml`. It
  builds `dist`, runs `wrangler pages deploy`, and passes only when the
  site's page and service worker both serve the tag's version. The steps
  are in `AGENTS.md` § Shipping a release.
- A service worker (`src/offline/`) keeps the files a release lists in a
  cache named for its version. The page comes from the network, falling
  back to the cache when the network fails or is slow; a new release takes
  over once every page of the old one has closed.

## Modules

`src/` holds one directory per game's rules, each reached only through its
`index.ts`: `quiz` (compare), `sorting`, `pairs` (find the pair),
`skeletons`, `dig`, `care`, `labyrinth`, `picturePuzzle`, `whoseJaw` and
`coloring`. A game's rules are plain functions with no React or storage.
Most import nothing but the languages (`src/language/`); picture puzzle and
Whose Jaw also take the age levels, and coloring's painter draws on canvas.

A game module (`*Game.tsx`) turns rules into screen views, screen actions
back into events, and owns transitions, counted starts and persistence.
Screens, texts and themes import no rules of the quiz, sorting, pairs,
skeleton, dig or care games; coloring's screens use its exported types.
`App.tsx` routes between Home, the catalogue, dinosaur pages and the games.

- **Quiz.** A round is 10 questions, each two distinct dinosaurs compared
  on height, mass or (above Hatchling) length; the larger value is at
  least 1.5 times the smaller, and no two questions use the same pair.
- **Labyrinth.** Its pure model owns generation, movement, hint history and
  rewards, with the best-score rule passed in; screens get cell and reward
  views and never import the model. Boards and positions are never saved.

`src/root.ts` is the composition root. It supplies the browser to the app:
`localStorage`, IndexedDB, the random source, the clock, timers, picture
loading and decoding, the window's size class and orientation, and the
theme and motion queries. A few adapters reach the browser themselves
(audio, the service worker). Every game scores by the one best-score rule
in `src/bestScore.ts`. `tests/architecture.test.ts` reads the import graph
and fails when a boundary it names breaks.

## Content

Dinosaur records live in versioned JSON in `src/data/` (`dinosaurs.json`,
`skeletons.json`, `dig.json`, `jaws.json`), with pictures under
`src/assets/`, loaded through Vite so each URL carries a content hash; the
icons in `public/` keep fixed URLs. Every fact follows `docs/sources.md`:
height is hip height in metres, length nose to tail, mass live body mass
in kilograms. Picture style is in `art/style.md`.

## Progress and settings

Progress is best effort: clearing the browser loses it, and that is
accepted.

- `rexlab-progress` in `localStorage` holds one versioned record
  (`schemaVersion`) with an entry per game under `games` and the Home
  state (`home-featured`, `home-first-visit`). Saving one entry leaves
  the others as they are. The fields of each, including per-level bests,
  are in `src/localProgress.ts`.
- An unreadable record, or one with an unknown `schemaVersion`, counts as
  no progress and is replaced by the next successful save. An unusable
  optional choice is dropped without losing readable rewards.
- When storage cannot be read, the quiz shows a round's score with no best
  and no celebration; labyrinth keeps rewards in memory for the session.
  Storage that can be read but not written celebrates against what was
  read and saves nothing.
- The best score is the highest ever, never the last round's. A best is
  `null` until a round is finished; a first round above 0 is a first best,
  a higher one a new best, and a first round of 0 is not celebrated. Only
  a finished round counts as played.
- Settings have keys of their own: `rexlab-language`, `rexlab-theme`,
  `rexlab-age-level` and `rexlab-whose-jaw-muted`.
- Coloring works, with their paint and undo history, live in the IndexedDB
  database `rexlab-coloring` (`docs/coloring.md`).

## Screens and input

- Each screen is laid out by the window's size class for iPad, iPhone and
  Mac (`docs/features/window-shape.feature`). A screen with no portrait
  layout asks to be turned sideways, or for a wider window.
- A double tap counts as one tap, and text and pictures never select or
  call out (`docs/tap-safety.md`).
- Every change on screen animates with the shared motion tokens; reduced
  motion uses short fades or none.
- Question pictures are all one size, so size never gives an answer away,
  and feedback pairs colour with ✓ or ✗.

## Testing

- Behaviour is specified in Gherkin under `docs/features/`, and tests under
  `tests/` prove the scenarios. `@next` marks planned behaviour, though some
  coloring files still carry it after shipping (`docs/games.md`).
- Game rules are tested directly in Node (`*.test.ts`). Screens and flows
  render in jsdom with the app's stylesheet (`*.test.tsx`); where fit
  matters, widths are measured in ems of the font against each window size
  (`docs/features/window-fit.feature`).
- Tests replace what the root supplies: a memory storage, a seeded random
  source, a fixed clock, and timers and pictures that fire when the test
  says. `root.test.ts` checks the root's wiring against browser fakes.
- Layout, touch and raster checks run in Chromium (`*.browser.cjs`;
  `AGENTS.md` § Browser checks). `scripts/test.sh` runs the core steps:
  clean install, typecheck, tests and build.

## Open

- Horn count has no definition or fairness threshold yet.
