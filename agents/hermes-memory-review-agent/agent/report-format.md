---
date: 2026-07-01
model: claude-opus-4-8
description: "Review report shape emitted by the hermes-memory-review-agent on every weekly run: front-matter, the seven fixed sections, the per-finding evidence shape, and the empty-cycle case."
---

# Review Report Format

The agent writes exactly one report per weekly run, in Markdown, to the canonical
skills repo at `reviews/memory-review/<snapshot-date>.md`. The shape is fixed so
the maintainer and any downstream consumer read the same artifact unambiguously.

## Front-matter

Every report starts with YAML front-matter:

```yaml
---
date: <snapshot date, YYYY-MM-DD>
model: <the agent's model, e.g. claude-opus-4-8>
description: "Hermes memory review for <snapshot-date> — <N> findings across <M> non-empty sections."
---
```

`date` is the **snapshot** date (the dated dir reviewed), not the run date.

## Top-level structure

```markdown
# Hermes Memory Review — <snapshot-date>

- Snapshot: <snapshot-date>
- Sessions reviewed: <count from state.db>
- Staged skill proposals: <count of pending/skills/*.json>
- Staged memory proposals: <count of pending/memory/*.json>
- Findings: <total across all sections>

## New durable facts
## Repeated coaching patterns
## Corrections from the user
## Failed approaches
## Candidate skill improvements
## Proposed canonical patches
## Reject / ignore
```

All seven `##` sections are present in this exact order on every report. A
section with no findings this cycle contains exactly the line:

```markdown
_None this cycle._
```

Never omit a section; never reorder; never add a section.

## The seven sections

- **New durable facts** — facts about the user or domain that are stable and
  worth keeping (from `MEMORY.md` / `USER.md` / recurring session evidence).
- **Repeated coaching patterns** — a coaching move that recurs across sessions
  and may deserve a canonical skill.
- **Corrections from the user** — where the user corrected the bot; each is a
  candidate guardrail.
- **Failed approaches** — approaches the bot tried that did not work; each is a
  candidate anti-pattern to record.
- **Candidate skill improvements** — concrete improvements to an existing
  canonical skill, keyed to the staged `pending/skills/` proposals where present.
- **Proposed canonical patches** — the specific canonical-skill change proposed
  (prose description; the unified diff / PR is Option C, deferred).
- **Reject / ignore** — staged proposals or observed patterns the review
  explicitly declines, with the reason, so they are not re-surfaced blindly.

## Per-finding shape

Each finding within a section is one bullet with mandatory evidence:

```markdown
- **<one-line finding>.**
  - Evidence: `<relpath within the dated snapshot dir>` — "<verbatim quote>"
  - _or_ Evidence: `state.db` — query `<SQL>`; session `<id>` / row `<id>`
  - Proposed: <the minimum concrete change or the decision, one or two lines>
```

Evidence rules:

- **File evidence** is a relative path inside the dated snapshot dir plus a
  verbatim quote (or a `<path>:<line>` reference). No paraphrase.
- **`state.db` evidence** is the exact read-only SQL run plus a stable identifier
  (session id / row id) so a reviewer re-running the query lands on the same rows.
- A finding that cannot carry one of these two evidence shapes is **dropped**, not
  reported.

## Empty-cycle case

If no findings survive the filters in `review-methodology.md`, every section
reads `_None this cycle._`, `Findings: 0` in the header, and the report is still
committed (so the weekly cadence leaves a dated record).

## Reproducibility

The same snapshot + the same methodology must yield a byte-identical report
across runs. A differing report on the same snapshot without a methodology change
is itself a defect — surface it in the header rather than committing silently.
