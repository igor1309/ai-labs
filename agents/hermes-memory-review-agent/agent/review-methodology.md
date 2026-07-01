---
date: 2026-07-01
model: claude-opus-4-8
description: "How the hermes-memory-review-agent mines a read-only Hermes snapshot: what to read, what qualifies for each of the seven report sections, and the false-positive filters that keep the review precise."
---

# Review Methodology

How to turn one read-only dated Hermes snapshot into the seven-section review
report (`report-format.md`). The goal is **precision, not recall**: a smaller
report every finding of which a reviewer can verify in one glance beats an
exhaustive list.

## What to read

All read-only, in the dated snapshot dir:

- `memories/MEMORY.md`, `memories/USER.md` — the bot's durable memory and its
  model of the user.
- `state.db` — session history. Query with the `sqlite3` CLI, read-only. It is
  FTS5-searchable; use full-text search to find recurring themes, corrections,
  and dead-ends rather than reading every session.
- `pending/skills/<id>.json` — skill edits the bot staged via `write_approval`
  but that have not been applied.
- `pending/memory/<id>.json` — memory edits staged the same way.
- `local-skills/` — the bot's own current `~/.hermes/skills`, for comparing a
  staged proposal against what exists.

Treat `state.db` as the evidence spine: a claim in `MEMORY.md` is stronger when a
session in `state.db` shows where it came from.

## What qualifies for each section

- **New durable facts** — a fact about the user or domain that is stable across
  sessions and not already captured, OR a fact in `MEMORY.md` newly corroborated
  by session evidence. Not: one-off details, ephemeral task state.
- **Repeated coaching patterns** — a coaching/explaining move that recurs across
  **two or more** sessions and could become (or strengthen) a canonical skill.
  Single occurrences are not patterns.
- **Corrections from the user** — a session turn where the user corrected the
  bot's behavior, facts, or tone. Each is a candidate guardrail. Cite the session.
- **Failed approaches** — an approach the bot tried that demonstrably did not
  work (user pushback, repeated retries, abandoned thread). Each is a candidate
  anti-pattern.
- **Candidate skill improvements** — a concrete improvement to an existing
  canonical skill. Where a `pending/skills/` proposal already targets it, key the
  finding to that proposal id.
- **Proposed canonical patches** — the specific canonical-skill change the review
  proposes, in prose (the unified diff + PR is Option C, deferred). Must trace to
  a pattern/correction/failed-approach finding above.
- **Reject / ignore** — a staged proposal or observed pattern the review
  explicitly declines (too narrow, personal, speculative, or already covered),
  with the reason, so it is not blindly re-surfaced next cycle.

## Evidence discipline

Every finding carries evidence in one of the two shapes from `report-format.md`
(file path + verbatim quote, or `state.db` SQL + stable id). Run the query you
cite; do not reconstruct it from memory. A finding you cannot evidence is
**dropped** — it does not go to "Reject / ignore" (that section is for
deliberate declines, not for unverifiable candidates).

## False-positive filters (drop these)

- **Personal, not product.** A fact specific to the individual user that would be
  privacy-sensitive to promote into a canonical skill. Note it as reject/ignore
  if it was staged; otherwise drop it. Never copy user-specific reference content
  into a proposed canonical patch.
- **Single occurrence dressed as a pattern.** One session is not a "repeated"
  pattern.
- **Restating memory.** A finding that only repeats what `MEMORY.md` already says
  without new session corroboration adds nothing.
- **Speculative improvement.** A "could maybe" skill change with no
  correction/failed-approach/pattern behind it.
- **Already canonical.** A proposal that duplicates behavior already in
  `local-skills/` or the canonical set.

## Determinism

Read the snapshot in a fixed order (memories, then `state.db` queries in the
order listed here, then `pending/`, then `local-skills/`) and sort multi-item
results before writing them, so the same snapshot yields the same report
(`report-format.md` "Reproducibility").

## Scope

One Hermes bot's snapshot per run (v0.0.1). If the snapshot layout indicates more
than one bot, review only the one the runtime handed you and note the others as
out of scope in the header — do not aggregate.
