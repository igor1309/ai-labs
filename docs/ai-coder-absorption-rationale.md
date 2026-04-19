---
date: 2026-04-19
author: Igor Malyarov
description: "Rationale for absorbing ai-coder repository into ai-labs"
---

# Absorbing ai-coder into ai-labs

## Context

Two repositories serve overlapping purposes:

- **ai-labs** — monorepo and playground for AI exploration: products, services, tools, pet projects, methodology (`docs/my-way/`), and AI systems/workflows.
- **ai-coder** — knowledge repo for AI-assisted development: guides, prompts, skills, reading notes, debates, insights, sandbox experiments, and small tools.

## Why merge

1. **ai-labs is not a narrow product monorepo.** It is a general AI playground. Methodology docs (`docs/my-way/`), exploration, and tooling already live here. ai-coder's content is the same nature.

2. **Eliminates cross-repo path dependency.** Global `~/.codex/AGENTS.md` references `~/dev/ai-coder/guides/` — an external path that breaks if the repo moves. After absorption, guides are local.

3. **Single context for AI agents.** Agents working in ai-labs can see guides, prompts, and methodology directly. No cross-repo reads needed.

4. **Skills publishing pipeline moves cleanly.** The dev-skills → igor1309/skills GitHub Actions workflow just needs updated paths.

5. **Reduces maintenance surface.** One fewer repo to maintain, one fewer CLAUDE.md to keep current.

## Content mapping

| ai-coder | ai-labs destination |
|---|---|
| `guides/` | `docs/guides/` or migrated into skills |
| `dev-skills/` | Stays as plugin source (or `dev-skills/`) |
| `prompts/` | `docs/prompts/` or migrated into skills |
| `insights/` | `docs/my-way/insights/` or `docs/insights/` |
| `debates/` | `docs/my-way/debates/` or `docs/debates/` |
| `reading/` | `docs/reading/` |
| `sandbox/` | `sandbox/` or individual top-level projects |
| `tools/` | `tools/` |
| `_inbox/` | `docs/_inbox/` |
| `gemini/` | `docs/gemini/` |

## Git history

Absorb with full git history using `git merge --allow-unrelated-histories` (or subtree merge). Preserves traceability — commits, blame, and decision context remain inspectable.

## Relationship to skills migration

The absorption is independent of but complementary to the AGENTS.md-to-skills migration (see `agents-md-to-skills-migration.md`). After absorption:

- Guides that become skills get migrated via the normal Phase A/C process.
- Guides that remain guides live in `docs/guides/` within the same repo.
- The `~/dev/ai-coder/guides/` reference in global AGENTS.md is replaced by a local path.
