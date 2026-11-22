---
date: 2026-11-01
description: "How a rexlab feature goes from issue to production, with the visual approval gate and the gotchas behind it"
---

# Feature process

Read this in full before working a rexlab issue. `AGENTS.md` has the
details of each step; this is the order, the gate, and what has gone wrong.

## Before creating an issue

No creature issue exists until its creature or plan is chosen. Weekly
autopilots post coloring suggestions and catalogue batch proposals every
Saturday at 04:00 UTC; use them as the starting point.

- **Coloring creature.** Suggest candidates, each with a reason, on
  LAB-822 and wait until Igor picks one there. Only then create a
  sub-issue under LAB-822 from the coloring template
  ([New coloring creature](#issue-template)).
- **Catalogue batch.** Follow the LAB-379 pattern.
  1. First a proposal issue: which creatures and why, where sizes and
     masses come from (`docs/sources.md`), which games each joins or
     skips, and any model or text changes. It stops until Igor accepts;
     the accepted plan goes into the description with its date.
  2. Then sub-issues in this order, one release each: model and texts →
     facts → pictures → into the games
     ([Catalogue batch](#catalogue-batch)).

## Checklist

1. **Spec.** Gherkin under `docs/features/`, EN and RU wording for every
   child-facing string, age levels named (Hatchling, Explorer,
   Paleontologist; `docs/age-levels.md`).
2. **Design.** New frames in `design/rexlab.pen` for each screen and size
   class it touches.
3. **Implement** in your own worktree and branch, one PR.
4. **Checks.** `npm run typecheck`, `npm test`, `npm run build`, and the
   fit/browser tests for every size class affected: iPad landscape and
   portrait, iPhone landscape and portrait, Mac.
5. **Visual approval gate** (below) if anything visual changed.
6. **PR CI green** on the current head, checked on GitHub, not inferred
   from local runs. Update from trunk first if trunk moved.
7. **Release.** Raise `version`, regenerate `release-units.toml`, merge,
   tag `rexlab_v<version>`.
8. **Production check.** https://rexlab.enoa.ai serves the new version and
   the feature works there. Only then is the issue delivered; the
   delivery comment names the PR, version, URL and what was verified.

## Visual approval gate (mandatory)

Applies to any new or changed visual asset (creature art, illustrations,
cards, icons, scenes) and any layout change per screen size.

- Post screenshots on the issue for **every age level and every size
  class it affects**, taken from the running app.
- Set the issue to `in_review` and stop. No merge, no release.
- Merge and release only after Igor approves in a comment.
- A rejection means redraw, then stop at the gate again. Passing tests
  says nothing about whether art looks good.

## Gotchas

- Art passed every coloring test and was still "terrible even for a
  4-year-old"; it was presented as final without approval (LAB-825, PR #1490).
- A simple drawing was right for age 4 and boring for 5–7: keep it as
  Hatchling, add a richer scene for older levels (LAB-823, PR #1475).
- Owner feedback was treated as a proposal to discuss, not a correction
  to implement (LAB-823). Same with "I recommend redrawing" (LAB-825): do it.
- A run stopped half-way without saying why (LAB-823).
- Local checks were reported as done while PR CI was failing
  (LAB-824 PR #1482, LAB-825 PR #1490).
- A branch went stale behind another creature's PR; wait for it to land,
  then update (LAB-824, PR #1481).
- Trunk changed controls from 60px to 48px and a branch's test still
  asserted 60px (LAB-825, PR #1490).
- Tests over CI's 5-second limit: split them, never raise the timeout
  (LAB-382 PR #1142, LAB-824 PR #1482, LAB-891 PR #1499).
- A behaviour change left a browser test expecting the old value
  (LAB-891, PR #1497).
- A browser test pressed Undo before the control was actionable and
  broke trunk CI after merge (LAB-891, PR #1500).
- "Land it" was read as merge only; merging deploys nothing
  (LAB-825, released as v0.10.84).
- A version bump without regenerating `release-units.toml` fails
  `release-validation` (LAB-578).
- Merging a side PR auto-closed the parent issue (LAB-822, PR #1476):
  reference the parent without a closing keyword.
- A sub-issue closes only after merge, release and production check
  (LAB-822, rule set 2026-11-01).
- Issues created without a selection or accepted plan (LAB-1762, LAB-1763).

## New coloring creature

Code in `src/coloring/` (`artworks.ts` registers each work; see
`trexScene.ts` and `ankylosaurusScene.ts` for the latest pattern).

- Two works: a simple **Hatchling** drawing with large regions, and a
  richer **Explorer/Paleontologist** scene (body markings, scenery).
- Small accents are protected linework, not tiny touch targets
  (LAB-825).
- Gallery picker preview matches the artwork; EN and RU name, in
  capitals.
- Saved works keep their geometry: never change the regions of a shipped
  work; add a new work instead, and test that old saved drawings
  reopen (LAB-824, LAB-889).
- Screenshots for the gate: gallery and workshop, each age level, iPad
  landscape and portrait, iPhone landscape and portrait.

### Issue template

```markdown
## Goal
Add <Creature> to coloring.

## Deliverable
- Hatchling drawing: simple, large regions.
- Explorer/Paleontologist scene: richer, with scenery; small accents as protected linework.
- Gallery preview, EN/RU name, specs in `docs/features/coloring-*.feature`.
- Existing saved works still reopen.

## Gate
Screenshots of gallery and workshop for every age level and size class on this issue,
then `in_review` and stop. No merge or release until Igor approves in a comment.

## Done when
PR merged, released, and verified on https://rexlab.enoa.ai; the comment names
PR, version and what was checked. Process: `rexlab/docs/feature-process.md`.
```

## Catalogue batch

A batch adds several creatures to the catalogue. Proposal first, then one
sub-issue per step, each released before the next starts.

### Issue template (proposal)

```markdown
## Goal
Propose catalogue batch <N>: <creatures>.

## Proposal
- Creatures and why each one.
- Sources for sizes and masses (`rexlab/docs/sources.md`).
- Games each creature joins or skips, and why.
- Model or text changes needed.

## Gate
Stop until Igor accepts in a comment. Put the accepted plan into this
description with its date, then create sub-issues in order, one release each:
1. Model and texts.
2. Facts.
3. Pictures (visual approval gate applies).
4. Into the games.

## Done when
Plan accepted and the four sub-issues exist. Process: `rexlab/docs/feature-process.md`.
```
