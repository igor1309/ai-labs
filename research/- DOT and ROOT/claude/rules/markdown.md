---
date: 2026-08-21
model: claude-opus-5
description: "Markdown file conventions — naming, structure, and the required front-matter contract"
---

# MARKDOWN FILES

File naming: use clear, descriptive kebab-case names (e.g., transfer-routing-summary.md).

Structure: use real Markdown headers (#, ##, ###) for section titles. Do not use "Label:" paragraphs as headers.
Hierarchy: exactly one # title per file; use ## for top-level sections and ### for subsections.
Lists: use standard Markdown lists (1. / -), not "1)".
Clarity: split long flows into named subsections; keep decision rules, error handling, and open questions in their own sections.

Every markdown file (except `SKILL.md`, `log.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/components/*.md`, and the repository-root `README.md`) must include front-matter with at least these fields:
- date: in YYYY-MM-DD format
- model: {you}
- description: concise explanation

`date` and `model` record the **last substantive change** to the file, not its
creation. Do not bump them for a metadata-only edit: a date claiming a review
that did not happen is worse than an old one, because the old one truthfully
flags what nobody has re-read. Where the model that made a past change is not
recoverable, write `unknown` rather than guessing.

for example:

```yaml
date: 2025-12-26
model: gpt-5.2
description: "Clarification Questions for Feature XXX"
```

Invoke the **doc-discipline** dev-skill for composing the document itself: shape
and the cold-reader pass, prose economy, link direction, what to cite instead of
a commit, and log entries.
