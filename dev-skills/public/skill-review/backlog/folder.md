---
date: 2026-06-16
model: claude-opus-4-8
description: "Proposed skill-review axis — supporting files bucketed by role (scripts/ references/ assets/)"
---

# skill-review backlog — folder shape

## Proposed Evaluation Axis — Folder shape (supporting-file bucketing)

Source: 2026-06-16, cross-reading the three canonical descriptions of skill
folder layout — the Anthropic overview
(`platform.claude.com/docs/en/agents-and-tools/agent-skills/overview`), the
agentskills.io specification (`agentskills.io/specification`), and the
agentskills.io home (`agentskills.io/home`) — against the skill's own research
notes (`research/01-anthropic-skills-guidance.md`,
`research/02-agentskills-io-canonical-spec.md`).

### The observation

All three sources independently land on the same three supporting-file buckets:

```
skill-name/
├── SKILL.md     # required — only mandatory file
├── scripts/     # executable code, run for output (code never enters context)
├── references/  # docs loaded on demand
└── assets/      # inert resources — templates, images, data, schemas
```

The spec explicitly allows "any additional files or directories," so this is
**not a conformance requirement**. But three independent sources converging on
the same three names is what a convention looks like before it is a clause.

### Why the buckets matter

The directory name encodes the loading contract — it is the type tag for each
file:

- `references/` = read on demand
- `scripts/` = run for output; the code never enters context
- `assets/` = inert resource

Flat siblings in the skill root (`FORMS.md`, `api.md`, `extract.py`,
`template.docx`, `schema.json` all loose) erase that signal: the agent gets no
cue about *what kind* of thing each file is, so it cannot reason about whether or
when to load it. Flat files create mess; subfolders drive structure.

### The gap

The current axes (§1–§7) cover description quality, signal-to-noise, progressive
disclosure (size limits, one-level-deep refs, gated links), and staleness — but
none asks whether a skill's supporting files are **bucketed by role**. A skill
can pass every existing axis with a dozen loose files in its root.

### Proposed axis text (promote into SKILL.md "Evaluation Axes" when shipped)

**Folder shape** (applies only to skills with supporting files)

- Are supporting files grouped by role into `scripts/` / `references/` /
  `assets/` (or equivalent), rather than scattered flat in the skill root?
- Does the bucket match the file's loading contract (executable → `scripts/`,
  read-on-demand doc → `references/`, inert resource → `assets/`)?

A flat skill is **not** a spec violation — `SKILL.md` plus one or two siblings is
fine. The finding triggers only once a skill carries more than a couple of
supporting files unbucketed. Cite the convergence of the three canonical sources
(this is cited precedent, not taste — it clears the evidence bar in AGENTS.md
"Review"). A single loose file is a comment at most, not a finding.

### When shipped

Fold the axis into `skill-review/SKILL.md` §Evaluation Axes, add it to the Output
Format section-by-section expectations, and remove this item.
