---
date: 2026-10-16
model: claude-opus-5-5
description: "Agent instructions for the RexLab project"
---

# AGENTS

RexLab is a dinosaur learning web app for children aged 5–7, served at
https://rexlab.enoa.ai from the Cloudflare Pages project `rexlab`.
Architecture: `docs/mvp-infrastructure.md`.

## Product principles

- Gamification is essential, not decoration. Every game rewards the child
  with a score and best-score celebrations, and achievements as they are
  built (LAB-266). Treat a missing or weak reward as a defect.
- Children of 5–7 are just learning to read. Write all text for children in
  capitals, in every language, and dinosaur names large. Keep the interface
  visually clear and easy to operate, and carry meaning with symbols and
  pictures rather than text: every button and card has a symbol or picture
  beside its words. Guidance text for parents, only where it is truly
  needed, is a small, slightly faded footnote in normal case.
- Motion is mandatory, not decoration. Every change on screen (a new screen,
  question, answer, reward or menu) animates smoothly with the shared motion
  tokens, quick rather than long, and falls back to short fades when the
  device asks for reduced motion. Treat an abrupt change as a defect.

## Specs

Behaviour is specified in Gherkin under `docs/features/`; a feature tagged
`@next` is not in the current build.

Build a game the way its specs are split: one implementation step per
screen, then one step for the full flow across screens. Never hand a whole
game to a single implementer run. Each criterion in a goal's "Done when"
opens with `**Screen <name>:**` or `**Full flow:**` and names its feature
files; each step's `## Covers` names exactly one of them.

## Commands

Run from `rexlab/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.

## Trying it locally

Day to day, run `npm run dev` from `rexlab/` and open http://localhost:5173.
Vite reloads the page on every save; nothing is deployed.

- On an iPad on the same Wi-Fi, run `npm run dev -- --host` and open the
  Network address Vite prints.
- Do not run `npm ci` while the server is running: it replaces
  `node_modules` under it.
- Progress lives in `localStorage` under `rexlab-progress`; delete that key
  in the browser's developer tools to play as a new child.
- A chosen language lives under `rexlab-language`; delete it to start in the
  device language again.
- A chosen theme lives under `rexlab-theme`; delete it to follow the device
  appearance again.

## Shipping a release

Releases go out only by tag; merging to trunk deploys nothing.

1. Raise `version` in `rexlab/package.json`, then run
   `node scripts/release/generate-manifest.js` from the repository root so
   `release-units.toml` matches; CI's `release-validation` fails otherwise.
2. Merge the pull request.
3. Tag the merged trunk commit `rexlab_v<version>`, with the same version as
   `package.json`, and push the tag.

The tag runs `release-unit.yml`, which calls `rexlab-deploy.yml`: core checks,
`wrangler pages deploy`, then a smoke check that https://rexlab.enoa.ai serves
the tag's version in its `rexlab-version` meta tag. The release passes only when
that check does; then the GitHub release is created.
