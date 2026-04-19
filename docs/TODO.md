---
date: 2026-04-19
description: "Tracked initiatives for ai-labs"
---

# TODO

## 1. AGENTS.md to Skills Migration

Migrate rules from CLAUDE.md and `~/.codex/AGENTS.md` into reusable skills installed per-project. Slim CLAUDE.md to ~50-80 lines as a wiring doc pointing to skills.

Plan: [agents-md-to-skills-migration.md](agents-md-to-skills-migration.md)

## 2. Absorb ai-coder into ai-labs

Merge ai-coder repository into ai-labs with full git history. Guides, prompts, skills authoring, insights, and sandbox experiments move into ai-labs.

Rationale: [ai-coder-absorption-rationale.md](ai-coder-absorption-rationale.md)

## 3. Install canonical skill plugin at project level

Install the canonical skills plugin (private repo) at ai-labs project scope and commit. Makes skills visible to web/remote agents via `.claude/`.

## 4. Move ai-labs local skills to dev-skills

Migrate local skills created in step 1 into the canonical dev-skills plugin. ai-labs then consumes them via auto-updating plugin instead of local copies.
