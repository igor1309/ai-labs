---
date: 2026-10-16
model: claude-opus-5-5
description: "Agent instructions for the RexLab project"
---

# AGENTS

RexLab is a dinosaur learning web app for children aged 5–7, served at
https://rexlab.enoa.ai from the Cloudflare Pages project `rexlab`.
Architecture: `docs/mvp-infrastructure.md`. Every dinosaur fact (names,
height, which is hip height, mass, diet, traits) follows the rules and
sources of `docs/sources.md`.
A double tap counts as one tap: screens, their animation, timers, taps and
pictures follow `docs/tap-safety.md`.

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
- Demote, never delete. When a game is made harder, its current behaviour
  becomes its easiest age level, Hatchling, rather than being replaced
  (`docs/age-levels.md`). A redesign issue says which of its modes is
  Hatchling, Explorer and Paleontologist; removing a mode a 4-year-old can
  play needs an explicit decision on the issue.

## Specs

Behaviour is specified in Gherkin under `docs/features/`; a feature tagged
`@next` is not in the current build.

Build a game the way its specs are split: one implementation step per
screen, then one step for the full flow across screens. Never hand a whole
game to a single implementer run. Each criterion in a goal's "Done when"
opens with `**Screen <name>:**` or `**Full flow:**` and names its feature
files; each step's `## Covers` names exactly one of them.

## Working an issue

An issue goes spec, design, implementation, review, in one branch and
one pull request.

- Work in a worktree of your own:
  `git worktree add -b <branch> ../ai-labs.worktrees/<branch> origin/trunk`.
  The main checkout stays on trunk: it serves the owner's dev server.
- Keep the round files (briefs, review outputs, logs) in `/tmp/<branch>/`,
  never in the repository.
- Run every review and implementer in the background and act on its
  completion notice; a run takes 5 to 30 minutes.
- Review cycles are costly. Code review is the pull request's gate
  only: run it once the branch is complete, never for a small change or
  a single step.
- Commit every design, in the one design file `design/rexlab.pen`. It is
  JSON, one document whose top-level frames are the screens, but git's
  line merge cannot join two branches' changes to it. Add new frames
  rather than changing other branches' ones. On a conflict, merge the
  parsed files: take trunk's, append the frames your branch added, write
  it back with `json.dumps(..., indent=2)`, and check that no id
  repeats. A branch that changes an existing frame while another
  branch's change to it is unmerged waits for that merge.
- The Pencil tools act on the document open in the editor, whatever
  file path they are given: open the branch's own file first, and check
  the editor's file before every edit.

### Spec review

Commit the spec first, then from the worktree's root run
`rexlab/scripts/spec-review.sh /tmp/<branch> <feature files>`. It
gives the same prompt to Codex and Claude, both read-only, and writes
`spec-review-<n>-codex.md` and `-claude.md`. Fix what holds up, commit
and run another round until no findings are left.

### Implementation with agister

1. Write a goal file in the format of `~/.agister/briefs/goal.yaml`:
   `## Intent` (referencing the issue, specs and design), `## Done when`
   (numbered, observable criteria), `## Out of scope`, `## Sources`,
   `## Decisions` (the owner's rulings, dated) and `## Open` ("None.").
2. Write a step brief in the format of `~/.agister/briefs/step.yaml`:
   `# <branch> step <n>: <what>, at <short sha>`, `## Goal` (the goal
   file's path in backticks), `## Covers` (criterion numbers),
   `## Acts on` (the findings it answers), `## Constraints` and `## Open`.
3. From the worktree's root, not inside `rexlab/`:
   `agister run implement_opus --dir rexlab --param brief=/tmp/<branch>/step-<n>.md --json > /tmp/<branch>/implement-<n>.json 2> /tmp/<branch>/implement-<n>.log`.
4. Read `.status`, `.output.checks`, `.output.summary`, `.output.notes`
   and `.output.open`; a failed run names its cause in `.error.class`.
   The implementer leaves its changes uncommitted: read the diff, run
   `rexlab/scripts/test.sh`, update `docs/log.md` and commit yourself.

### Code review with agister

The gate before the pull request. Commit first: the review reads the
committed diff. From the worktree's root, run
`agister run code_review --dir rexlab --param goal=/tmp/<branch>/goal.md --json > /tmp/<branch>/review-<n>.json`.
Five Codex reviewers (architecture, tests, adversarial, clarity, intent)
report and a Claude Opus judge joins their findings; the base defaults to
`origin/trunk` and the candidate to `HEAD`. Answer the judge's items in
one more step brief's `## Acts on`, and fix small items yourself; run
the gate again only when the fixes change the design.
`agister workflow show code_review --dir rexlab` shows the output shape.

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
