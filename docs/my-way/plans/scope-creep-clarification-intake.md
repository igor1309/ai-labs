---
date: 2026-06-12
description: "Intake brief: clarify in My Way docs that downstream movement carries a partial slice, intent is never locked, and cascading changes are welcome."
format: intake-brief
---

# Intake Brief — Partial Scope, Never-Locked Intent, Welcome Cascades

## What I'm Building

A clarification in the My Way docs correcting a plausible misreading: that
moving from one layer to the next (e.g., Product Intent → ADR) requires the
downstream artifact to cover the *entire* upstream scope. The docs should state
the opposite, in three connected points:

1. **Partial slices are the norm.** A downstream move may carry any slice of
   the upstream scope — ten accepted stories, start with one. This is XP-style
   exploration: the early slice exists to educate, discover, and improve
   understanding, not to discharge the whole intent at once.
2. **Intent is never locked.** Two-way movement is already documented; the
   clarification makes explicit that discovery during downstream work may flow
   back and *tweak the intent itself* — at any level, at any time.
3. **Cascading changes are welcome.** A tweaked intent may invalidate
   downstream artifacts and force rework. That cascade is the method working,
   not a cost to be avoided — it is not prohibited, it is welcome.

Per alignment (2026-06-12): the clarification lands in the **two core docs
only** — `docs/my-way/pre-coding-phase.md` (§Iteration) and
`docs/my-way/00-product-intent/note.md` ("must preserve" definition and
"Change propagation"). Echo surfaces (informal-brief, xp-roots, drafting
skills, landing.html) are left alone unless they actively contradict the
clarified text.

## What I'm Touching

- `docs/my-way/pre-coding-phase.md` — §Iteration (lines ~223–232) is the
  natural home; front matter carries `version: 0.0.6`, which must be bumped.
- `docs/my-way/00-product-intent/note.md` — "Purpose" (the "must preserve"
  sentence), "Relationship to downstream artifacts", and "Change propagation"
  (already says stories are "living artifacts" but frames change as a gate —
  "should trigger impact review" — rather than as welcome).
- `docs/log.md` — log entry before push (repo convention).
- Branch: `claude/scope-creep-docs-nvbhan`.

## Findings

- **Scope:** searched all of `docs/my-way/` (50 files) for "scope creep",
  "must preserve", "cover/coverage", and two-way-movement language; read
  `pre-coding-phase.md`, `elevator-pitch.md`, `informal-brief.md`,
  `prior-art/xp-roots.md`, `00-product-intent/note.md`,
  `00-product-intent/structure.md` in full; checked `landing.html` and the
  drafting skills for echoes. Excluded: coding-phase.md, variants, research
  notes (skimmed via grep only).
- **Pattern evidence:** "must preserve" appears ~10 times across the doc set
  (pre-coding-phase.md:67,206; informal-brief.md:41; 00-product-intent/note.md:11;
  xp-roots.md:15,25; product-intent-drafting SKILL; landing.html:596). None of
  these statements distinguishes "preserve" (don't contradict/redefine) from
  "cover" (address all of it) — that gap is the source of the misreading.
- Two-way movement is already well documented: `pre-coding-phase.md`
  §Iteration ("not strictly linear and not one-way… revisiting an earlier
  layer is not a sign that the process has failed"), `elevator-pitch.md`
  ("Every `=>` is a loop… stepping back to any earlier layer… part of the
  method"), `xp-roots.md` (Courage, Feedback). What §Iteration describes,
  however, is only *returning to fix an earlier artifact* — it never says the
  forward move may be partial, nor that the return may *change the intent*
  rather than merely revisit it.
- Cascading is half-documented: `informal-brief.md:43-46` — "If you change the
  intent, you fix everything downstream that depends on it." States the
  mechanic but reads as a deterrent/cost, not as welcome.
- Closest existing partial-scope acknowledgment:
  `skills/implementation-plan/implementation-plan-drafting/SKILL.md:43` — "The
  plan must preserve accepted Product Intent during execution without forcing
  every slice to be story-shaped." Slicing is acknowledged only at the plan
  layer, not for movement between upper layers.
- `informal-brief.md` "Pruning user stories" (~7 stories, rest to backlog) is
  about list size at intent level, not about slicing downstream movement.
- `landing.html:576,788` defines orphan/scope-creep tracing ("every node
  traces back to a source intent — no orphans, no scope creep"). This is
  *backward* traceability (no downstream invention) and is compatible with
  partial forward coverage — no contradiction, no edit needed.
- `00-product-intent/structure.md` "Downstream traceability" table maps
  stories → artifacts "when those artifacts exist" — already tolerates gaps;
  no edit needed.

## Key Constraints

- **"Must preserve" is load-bearing.** It is the anti-drift rule (an ADR
  cannot contradict intent; downstream artifacts must not quietly redefine
  the product — informal-brief.md:43-46, landing.html orphan rule). The
  clarification must sharpen the distinction *preserve ≠ cover completely*
  without weakening preserve into "anything goes."
- Two-way movement and "revisiting is not failure" are already established;
  the clarification extends, not replaces, §Iteration.
- `pre-coding-phase.md` front matter version (`0.0.6`) must be bumped with the
  edit. `00-product-intent/note.md` has no version field — date/description
  only.
- `docs/log.md` entry required before push; commit on
  `claude/scope-creep-docs-nvbhan`, push with `git push -u origin`.
- My-way doc voice: first-person method notes, measured tone, "part of the
  method, not a failure of it" cadence — clarification should read native.
- Echo surfaces are out of scope per alignment unless they actively
  contradict the new text (none found that do).

## Risks & Unknowns

- Over-correction risk: phrasing that welcomes intent changes could be read as
  licensing downstream artifacts to drift from intent. The directionality must
  stay: downstream never silently redefines intent; intent changes flow
  *through* the intent artifact and cascade down (Change propagation /
  Change review stay authoritative).
- `informal-brief.md`'s deterrent framing of cascades ("you fix everything
  downstream") will remain as-is per alignment; mild tonal tension with the
  new "cascades are welcome" text is accepted.
- The exact placement within §Iteration (extend the existing section vs. add a
  sibling subsection) is a drafting decision deferred to implementation.
