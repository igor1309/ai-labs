---
date: 2026-11-01
description: "How a rexlab feature goes from issue to production, with the visual approval gate and its rules"
---

# Feature process

Read this in full before working a rexlab issue. `AGENTS.md` has the
details of each step; this is the order, the gate and the rules around them.

## Before creating an issue

No creature issue exists until its creature or plan is chosen. Weekly
autopilots post coloring suggestions and catalogue batch proposals every
Saturday at 04:00 UTC; use them as the starting point.

- **Coloring creature.** Suggest candidates, each with a reason, on
  LAB-822 and wait until the owner picks one there. Only then create a
  sub-issue under LAB-822 from the coloring template
  ([New coloring creature](#issue-template)).
- **Catalogue batch.**
  1. First a proposal issue: which creatures and why, where sizes and
     masses come from (`docs/sources.md`), which games each joins or
     skips, and any model or text changes. It stops until the owner accepts;
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
- Merge and release only after the owner approves in a comment.
- A rejection means redraw, then stop at the gate again. Passing tests
  says nothing about whether art looks good.

## Rules

- Passing every coloring test says nothing about whether art is good enough
  for a 4-year-old; art is never presented as final before approval.
- A simple drawing right for age 4 is boring for 5–7: keep it as Hatchling
  and add a richer scene for the older levels.
- The owner's feedback, "I recommend redrawing" included, is a correction to
  carry out, not a proposal to discuss.
- A run that stops half-way says why.
- Checks are reported done only from PR CI on the current head, never from
  local runs.
- A branch behind another creature's PR waits for it to land, then updates
  from trunk.
- After updating from trunk, run the tests again: trunk may have changed a
  value a branch's test asserts.
- A test over CI's 5-second limit is split, never given a longer timeout.
- A behaviour change updates every browser test that expects the old value.
- A browser test waits until a control is actionable before pressing it.
- "Land it" means merge, release and production check; merging deploys
  nothing.
- A version bump without regenerating `release-units.toml` fails
  `release-validation`.
- A side PR references its parent issue without a closing keyword, or its
  merge closes the parent.
- A sub-issue closes only after merge, release and production check.

## New coloring creature

Code in `src/coloring/` (`artworks.ts` registers each work; see
`trexScene.ts` and `ankylosaurusScene.ts` for the latest pattern).

- Two works: a simple **Hatchling** drawing with large regions, and a
  richer **Explorer/Paleontologist** scene (body markings, scenery).
- Small accents are protected linework, not tiny touch targets.
- Gallery picker preview matches the artwork; EN and RU name, in
  capitals.
- Saved works keep their geometry: never change the regions of a shipped
  work; add a new work instead, and test that old saved drawings
  reopen.
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
then `in_review` and stop. No merge or release until the owner approves in a comment.

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
Stop until the owner accepts in a comment. Put the accepted plan into this
description with its date, then create sub-issues in order, one release each:
1. Model and texts.
2. Facts.
3. Pictures (visual approval gate applies).
4. Into the games.

## Done when
Plan accepted and the four sub-issues exist. Process: `rexlab/docs/feature-process.md`.
```
