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
- Children of 5–7 are just learning to read. Write dinosaur names in large
  capitals, keep the interface visually clear and easy to operate, and carry
  meaning with symbols and pictures rather than text: every button and card
  has a symbol or picture beside its words. Guidance text for
  parents, only where it is truly needed, is a small, slightly faded footnote.

## Specs

Behaviour is specified in Gherkin under `docs/features/`; a feature tagged
`@next` is not in the current build.

## Commands

Run from `rexlab/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.

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
