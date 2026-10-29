# RexLab

A dinosaur learning web app for children aged 5–7, played on an iPad and
served at https://rexlab.enoa.ai.

The first game, Compare, asks which of two dinosaurs is heavier or taller,
ten questions a round, and celebrates a new best score. It is in English and
Russian, with all text for children in capitals, and has light and dark
themes.

- Behaviour: `docs/features/` (Gherkin).
- Architecture: `docs/mvp-infrastructure.md`.
- Dinosaur pictures: `art/style.md`; placeholders stand in until the
  artwork is generated.
- Running it locally, commands and releases: `AGENTS.md`.

For the board's browser geometry checks, run `npx playwright install chromium`
once, then `npm run test:browser` from `rexlab/`. The check starts and closes
its own Vite server and browser, and prints a unique temporary directory for
screenshots. It checks 60 reduced-motion configurations and one normal-motion
outward walk. Set `CHROME_PATH` to use a local Chrome executable, or `BOARD_URL`
to check an already running server instead. CI installs Chromium with its OS
dependencies and runs these checks on shard 1.
