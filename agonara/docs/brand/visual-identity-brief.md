---
title: Agonara Visual Identity Brief
description: Designer-facing brief for developing Agonara's visual identity — name meaning, positioning, tone, audience, and concrete direction for mark, type, color, and applications.
date: 2026-06-20
version: 0.1.0
status: draft
audience: visual identity designers
---

# Agonara Visual Identity Brief

A handoff brief for designers developing Agonara's visual identity. It carries
the naming rationale forward into a visual direction, states what the identity
must and must not express, and describes where it has to work.

Naming and brand-meaning sections below are drawn from the
[Agonara Brand Brief](brand_brief.md) (EN; Russian parallel:
[brand_brief_ru.md](brand_brief_ru.md)), which remains the source of record for
the name, tone, and positioning; this document does not change them. The visual
direction itself is open — see "No Visual Reference Yet" below.

## In One Line

Agonara is a structured learning program environment. The identity should feel
serious, focused, and formative — learning as disciplined passage through
challenge, not casual content consumption.

## The Name (carry this into the design)

**Agonara** draws from the ancient Greek root **agon**: contest, struggle,
exercise, trial, disciplined striving. The emphasis is structured effort toward
mastery — not competition against others.

The name is **not self-explanatory**. Without supporting copy it can read as a
fantasy place name or an abstract brand. The visual system carries part of the
anchoring load: it should reinforce "structured, formative, ancient-rooted but
modern," so the mark and type do not leave the name floating.

Brand-meaning layers to express visually:

| Layer | Meaning |
|---|---|
| Ancient root | Agon: exercise, contest, disciplined struggle |
| Product metaphor | Learning as a structured passage through challenge |
| Emotional tone | Serious, focused, formative |
| Functional tone | Program, progression, checkpoints, mastery |
| Avoided tone | Casual edtech, gamified learning, course marketplace |

## What Agonara Is (product context)

Agonara is a **bring-your-own-agent (BYOA)** learning program environment.
Operators run their own private, self-hosted instance and connect their own
agent through its API; curation stays human-owned, and AI assists rather than
authors — the agent operates the product, not the curriculum.

Its center is the **program**: what should be learned, in what order, by what
evidence, and under whose curation. It is not a note app, course directory,
LMS, or AI tutor.

Core verbs: **curate, follow, verify.** Curators shape trusted sources into a
program; learners move through it with checks and feedback; progress stays
grounded in learner-owned evidence.

## Audience

- **Serious self-directed learners** who want structured progress over
  scattered study.
- **Program curators** who assemble and maintain curated programs.
- **Operators/admins** who run a private instance.

These are technical, discerning users comfortable with APIs, agents, and the
terminal. The identity should respect their seriousness, not talk down to them.

## Personality And Voice

Precise, calm, serious. Formative rather than motivational.

- **Express:** structure, sequence, progression, evidence, mastery, discipline,
  threshold, continuity.
- **Avoid:** "unlock your potential," "learn anything faster," "AI tutor for
  everyone," gamification, streaks, badges, confetti, motivational gloss.

## What The Identity Must Express

1. Seriousness and focus — a tool for disciplined work.
2. Structure and progression — sequence, checkpoints, passage.
3. Ancient-rooted but modern — the agon idea, without literal antiquity kitsch.
4. Human ownership — curation is human; calm authority, not automated magic.

## What The Identity Must Avoid

- Cartoon education visuals; graduation-cap and pencil/apple clichés.
- Gamified learning cues (badges, streaks, mascots, confetti).
- Course-marketplace / consumer-edtech brightness and busyness.
- AI-chat-tutor tropes (chat bubbles, sparkles, robot faces).
- Literal arena/gladiator illustration that tips agon into combat kitsch.

## No Visual Reference Yet

**There is no established visual identity for Agonara, and no design reference
to match.** This is a blank canvas.

The product does ship HTML/web surfaces (`agonara/index.html`,
`agonara/architecture.html`, `src/admin-ui.js`, `src/learn-ui.js`), but their
current styling is **placeholder scaffolding, not a reference** — do not treat
its colors, type, or layout as a baseline to preserve or refine. The new
identity should drive those surfaces, not the other way around.

One **functional** constraint does carry over from the product, independent of
any specific styling: the UI color-codes five domains —
**student, curator, admin** (user roles) and **corpus, membership** (modules) —
which need to be visually distinguishable in-product. The current hues are
placeholder; the *requirement* for five accessible, mutually distinct domain
colors is real and should be designed into the system.

## Visual Direction

A restrained system. Geometric, structural, quiet. The points below are starting
suggestions, not constraints — the designer owns the visual call.

- **Color:** one disciplined, muted, serious palette that works for product UI
  first. The brand brief's original sketch was a classical set — stone,
  parchment, ink, slate, bronze, deep blue, muted gold — offered as one possible
  starting point, not a mandate. Reserve saturation for meaning (e.g., the
  domain colors), not decoration.
- **Type:** a minimal serif/sans pairing is on the table for brand surfaces; the
  product relies on a clean sans plus a monospace for CLI/code. Keep a monospace
  relationship in mind — Agonara is operated through an API and terminal, and
  type should acknowledge that.
- **Imagery:** geometric marks over illustration. Arenas, thresholds, tablets,
  progression rings — abstracted, never literal.

### Mark concepts (starting points, not a shortlist to pick from blindly)

1. **Arena Ring** — circular progression mark with one open threshold.
2. **Trial Path** — a line passing through checkpoints.
3. **Tablet + Axis** — knowledge corpus plus structured progression.
4. **A-shaped Gate** — entry into a disciplined program.

The mark should survive at terminal/favicon scale and in a single ink color.

## Where It Has To Work (applications)

Agonara is operated through an API, a CLI, and web surfaces, so the identity
must hold across:

- **Web UI:** landing (`index.html`), architecture page, learn UI, admin/board
  UI — information-dense surfaces that use the five domain colors functionally.
- **Favicon / app mark** at 16–32px.
- **Monochrome / single-ink** use (docs, diagrams, embossed/print).
- **README and docs** headers.
- **Terminal-adjacent** contexts (the product is agent- and CLI-operated; the
  mark and wordmark should sit comfortably near monospace text).

It does **not** currently need: physical packaging, large-format signage, or
motion/brand video. Treat those as out of scope unless asked.

## Requested Deliverables

1. **Primary logo** (wordmark + mark) and a **standalone mark** for small sizes.
2. **Color system** with tokens, including a **five-color domain set**
   (student, curator, admin, corpus, membership) that is mutually distinct and
   accessible within the chosen palette.
3. **Type system**: brand pairing and product UI/mono stack.
4. **Usage rules**: clear space, min sizes, monochrome behavior, do/don't.
5. **Favicon** and a small set of applied examples (landing hero, docs header).

Source files plus exported assets; tokens in a form the existing CSS
custom-property setup can adopt.

## Constraints

- The five domain colors carry meaning in-product; any palette must keep them
  mutually distinguishable and accessible against the chosen surfaces.
- Meet WCAG AA contrast for text and UI on the chosen backgrounds.
- The wordmark is a coined name with no diacritics; keep it legible and
  unambiguous in lowercase, uppercase, and monospace neighbors.

## Open Questions (please decide / advise)

1. **Palette:** which color direction — the brand brief's classical
   stone/bronze/deep-blue set, a warm-dark system, or something else? (Open;
   no prior identity to honor.)
2. **Light mode:** is a light theme required, or is Agonara dark-first?
3. **Serif:** does the brand wordmark want a serif voice, or stay all-sans to
   match the operated/technical product surfaces?
4. **Agon literalism:** how far to lean into arena/threshold imagery before it
   reads as combat or antiquity kitsch?

## References

- [Agonara Brand Brief (EN)](brand_brief.md) — name, tone, voice, taglines,
  original visual direction.
- [Agonara Brand Brief (RU)](brand_brief_ru.md) — Russian parallel.
- [Agonara Positioning](../positioning.md) — anchor, problem, BYOA framing.
- Placeholder surfaces (context only, **not** a visual reference):
  `agonara/index.html`, `agonara/architecture.html`,
  `agonara/src/admin-ui.js`, `agonara/src/learn-ui.js`.
