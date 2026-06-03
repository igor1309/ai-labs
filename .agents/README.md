---
date: 2026-06-02
model: claude-opus-4-8
description: "Purpose and status of the .agents progressive-disclosure agent-docs folder"
---

# .agents

Progressive-disclosure agent docs: topic-specific files referenced from the root
`CLAUDE.md` / `AGENTS.md` and read on demand, so the root instruction file stays a
slim discovery doc instead of a 300-line monolith.

Rationale and the patterns this folder follows are documented in
[`research/agents-md-organization.md`](../research/agents-md-organization.md)
(see the `agent_docs/` layout under "Progressive Disclosure Pattern").

## Status

Scaffold only. No topic files exist yet. The file set is intentionally deferred to
the analysis step below.

## Immediate TODO

See [`TODO.md`](TODO.md): analyse candidate content and decide, per file, whether it
should become a skill, a doc here, or a `.claude/rules/` entry.
