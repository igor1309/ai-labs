# RexLab architecture

The rules RexLab's code follows. Re-read them before designing or building.

What this file holds, and what it does not:

- **It holds rules:** where the app runs, how modules depend on each other,
  where the browser is reached, and how progress is kept.
- **It holds no feature design.** What a game does, its rounds, levels,
  rewards and stored fields are its Gherkin specs under `docs/features/`,
  the oracle for its behaviour, with the reasoning in its `docs/*.md` note.
  A feature changes this file only when it needs a new rule.
- **It names no code** beyond the entry points the rules are about. Types,
  files and wiring live in the code.

## Rules

1. **Static and local.** RexLab is built to static files and served by
   Cloudflare Pages. There is no server, database or account; every rule
   runs in the browser, and progress stays on the device. A release ships
   only from a tag, and a service worker
   lets an installed release run without a network.
2. **A game's rules are pure.** Each game's rules are plain functions in a
   directory of their own under `src/`, reached only through its
   `index.ts`. They use no React and no storage, and import nothing beyond
   the languages and the age levels.
3. **A game module connects rules to screens.** It turns rules into screen
   views and screen actions into events, and owns transitions, counted
   starts and persistence. Screens, texts and themes import no game's rules.
4. **The composition root supplies the browser.** `src/root.ts` gives the
   app storage, the random source, the clock, timers, pictures, the window's
   size class and the theme and motion queries. Only an adapter it wires
   may reach the browser itself.
5. **One best-score rule.** Every game that keeps a score scores by `src/bestScore.ts`: the
   best is the highest ever, never the last round's.
6. **Progress is best effort.** A game's progress lives in one versioned
   browser-local record, one entry per game (a coloring's saved works are
   kept apart, in IndexedDB); saving one entry leaves the
   others as they are. An unreadable record or unknown version counts as no
   progress. A game that cannot read or save still plays; it never shows a
   best or celebration it cannot back. Losing browser data is accepted.
7. **Facts follow their sources.** Every dinosaur fact follows
   `docs/sources.md`; content is versioned JSON under `src/data/`.
8. **Tests replace what the root supplies.** Tests pass a memory storage, a
   seeded random source, a fixed clock, and timers and pictures that fire
   when the test says, so nothing waits on time or chance.
   `tests/architecture.test.ts` reads the import graph and fails when a
   boundary it names breaks.

## Open

- The import test covers each game's boundaries by name; a new game needs
  its own lines there.
