# RexLab architecture

RexLab is a static web app: React, TypeScript and Vite, built to files and
served by Cloudflare Pages at https://rexlab.enoa.ai. There is no server,
database or account; every rule runs in the browser and progress stays on
the device.

## Hosting and releases

- Cloudflare Pages project `rexlab`, free tier, on the `enoa.ai` domain.
- Every pull request that touches RexLab runs `rexlab-core.yml`: typecheck,
  tests and build. Merging deploys nothing.
- A `rexlab_v<version>` tag on trunk runs `release-unit.yml`, which checks
  the tag against `release-units.toml` and calls `rexlab-deploy.yml`. It
  builds `dist`, runs `wrangler pages deploy`, and passes only when the
  site serves the tag's version in its `rexlab-version` meta tag. The steps
  are in `AGENTS.md` § Shipping a release.
- A service worker (`src/offline/`) keeps each release's files in a cache
  named for its version. The page comes from the network while there is
  one and from the cache when there is none; a new release takes over once
  every page of the old one has closed.

## Modules

`src/` holds one directory per game's rules, each reached only through its
`index.ts`: `quiz` (compare), `sorting`, `pairs` (find the pair),
`skeletons`, `dig`, `care`, `labyrinth`, `picturePuzzle`, `whoseJaw` and
`coloring`. A game's rules are plain functions with no React, browser or
storage, and import nothing but the languages (`src/language/`).

Screens (`*Screen.tsx`), texts and themes import no game's rules: a game
module turns rules into screen views and screen actions back into events.
`App.tsx` routes between Home, the catalogue, dinosaur pages and the games.

`src/root.ts` is the composition root. It alone reaches the browser:
`localStorage`, IndexedDB, the random source, the clock, timers, picture
loading and decoding, audio, the window's size class and orientation, and
the theme and motion queries. It gives each game the one best-score rule
(`src/bestScore.ts`). `tests/architecture.test.ts` reads the import graph
and fails when any of these boundaries breaks.

## Content

Dinosaur records live in versioned JSON in `src/data/` (`dinosaurs.json`,
`skeletons.json`, `dig.json`, `jaws.json`), with pictures under
`src/assets/`, loaded through Vite so each URL carries a content hash.
Every fact follows `docs/sources.md`: height is hip height in metres, mass
is live body mass in kilograms. Picture style is in `art/style.md`.

## Progress and settings

Progress is best effort: clearing the browser loses it, and that is
accepted.

- `rexlab-progress` in `localStorage` holds one versioned record
  (`schemaVersion`) with an entry per game under `games` and the Home
  counters (`home-featured`, `home-first-visit`). Saving one entry leaves
  the others as they are. The fields of each are in `src/localProgress.ts`.
- An unreadable record, or one with an unknown `schemaVersion`, counts as
  no progress and is replaced by the next save. Storage that cannot be
  read shows a round's score with no best and no celebration; storage that
  can be read but not written celebrates against what was read and saves
  nothing.
- The best score is the highest ever, never the last round's. `bestScore`
  is `null` until a round is finished; a first round above 0 is a first
  best, a higher one a new best, and a first round of 0 is not celebrated.
- Settings have keys of their own: `rexlab-language`, `rexlab-theme`,
  `rexlab-age-level` and `rexlab-whose-jaw-muted`.
- Coloring works, with their paint and undo history, live in the IndexedDB
  database `rexlab-coloring` (`docs/coloring.md`).

## Screens and input

- Each screen is laid out by the window's size class for iPad, iPhone and
  Mac (`docs/features/window-shape.feature`). A screen with no portrait
  layout asks to be turned sideways.
- A double tap counts as one tap, and text and pictures never select or
  call out (`docs/tap-safety.md`).
- Every change on screen animates with the shared motion tokens and falls
  back to short fades under reduced motion.

## Testing

- Behaviour is specified in Gherkin under `docs/features/`; each scenario
  is proved by a test under `tests/`. A feature tagged `@next` is not built.
- Game rules are tested directly in Node (`*.test.ts`). Screens and flows
  render `App` in jsdom with the app's stylesheet (`*.test.tsx`); where fit
  matters, widths are measured in ems of the font against each window size
  (`docs/features/window-fit.feature`).
- Tests replace what the root supplies: a memory storage, a seeded random
  source, a fixed clock, and timers and pictures that fire when the test
  says. `root.test.ts` checks that the root wires the real browser.
- Layout, touch and raster checks run in Chromium (`*.browser.cjs`;
  `AGENTS.md` § Browser checks). `scripts/test.sh` runs what CI runs: clean
  install, typecheck, tests and build.

## Open

- Attributes after height and mass (length, horns) have no definition or
  fairness threshold yet; the quiz asks a pair only when the larger value
  is at least 1.5 times the smaller.
