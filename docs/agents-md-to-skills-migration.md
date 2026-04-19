---
date: 2026-04-19
author: Igor Malyarov
description: "Plan for migrating AGENTS.md/CLAUDE.md rules into reusable skills"
---

# AGENTS.md to Skills Migration

## Problem

The project instruction files (global `~/.codex/AGENTS.md` at 180 lines, project `CLAUDE.md` at 297 lines) are too large. Research shows instruction-following degrades uniformly as instruction count grows — all rules suffer, not just late ones. Anthropic targets under 200 lines per file; combined these files load ~477 lines every session.

Additional problems:
- **No reusability.** Rules are inlined per-project. Shared conventions (Swift, TDD, review) are copy-pasted or maintained only in user-scoped files.
- **Web agent blind spot.** User-scoped files (`~/.codex/AGENTS.md`, `~/.claude/`) are invisible to web/remote agents. Rules maintained only there cause drift and mistakes in web sessions.
- **Weak enforcement.** However strongly worded, instruction file rules are probabilistically followed. No amount of "MUST" or "NEVER" guarantees compliance.

## Solution

Migrate detailed rules into **skills** — versioned, reusable, installable per-project, visible to both CLI and web agents.

### Architecture

```
CLAUDE.md (~50-80 lines)          ← slim wiring doc: identity, commands, pointers to skills
.claude/skills/<skill>/SKILL.md   ← detailed rules, committed to repo, visible to all agents
hooks                             ← hard enforcement for non-negotiable gates
```

### Enforcement hierarchy

1. **Hooks** — mechanical, tool-gating, non-bypassable. For truly non-negotiable gates.
2. **Review-as-enforcement** — review skills check against the same rules process skills define. Structured post-hoc catch. See [review-as-enforcement.md](my-way/review-as-enforcement.md).
3. **Instruction file rules** — always-loaded context. Probabilistic compliance.

### What stays in CLAUDE.md

- Project identity (2-3 sentences)
- Tech stack
- Build/test commands (exact, copy-pasteable)
- Hard invariants that apply on every task (trunk protection, protocol ownership, scope discipline)
- Pointer table: "for X, use skill Y"
- Disabled skills list

### What becomes skills

| Skill | Source |
|---|---|
| Swift conventions | `~/.codex/AGENTS.md` Swift section + linting + type extension scope |
| Swift testing | `~/.codex/AGENTS.md` Testing section |
| TDD discipline | `CLAUDE.md` Strict TDD + No-junk scope lock |
| Code review | `~/.codex/AGENTS.md` Review + implementation plans from review |
| Process gates | `CLAUDE.md` Pre-commit scope check + step closeout + preflight gate + process discipline + plan creation lock |
| Release process | `CLAUDE.md` Release process + release invariants |
| Docker discipline | `CLAUDE.md` Docker compose + deploy fix + local docker verification + ByteBuffer |
| ADR governance | `CLAUDE.md` ADR governance |
| Architecture doc review | `CLAUDE.md` Architecture doc review + dependency API versions |
| CI isolation | `CLAUDE.md` Per-project CI isolation |
| Markdown conventions | `~/.codex/AGENTS.md` Markdown files + log |

### What stays in `~/.codex/AGENTS.md` (~20 lines)

Truly universal personal behavioral preferences only:
- Path rules (relative within working dir, absolute outside)
- "Never instruct the user to run a command"
- "Respect stated decisions"
- Python command rule
- Commit message style

## Skill distribution

Skills are committed to each project's `.claude/skills/` directory. This is the most reliable path — no marketplace dependency, no network requirement, works with private skill repos.

### Sync mechanism

A canonical skills plugin (private repo) is installed per-project from the marketplace with auto-update enabled. When the CLI agent runs locally, it auto-updates the committed skill files. Web agents use the committed version — potentially slightly stale, but acceptably fresh since skills stabilize quickly after the initial active development period.

### Why not alternatives

- **`.claude/rules/` with path scoping** — good for always-loaded rules, but not reusable across repos and not a distribution mechanism.
- **Copy-paste with sync comments** — second source of truth with no actual sync. Drift is inevitable.
- **Git submodules** — technically elegant, practically fragile. Web agents may not initialize submodules.
- **Custom sync scripts** — unnecessary complexity. The plugin auto-update mechanism already exists.

## Phases

### Phase A: Extract skills locally (this repo)

Extract rules from CLAUDE.md/AGENTS.md into `.claude/skills/` one at a time. Each extraction:

1. Create the skill (SKILL.md + references/ if needed).
2. Reference the skill from CLAUDE.md.
3. Remove the inlined content from CLAUDE.md.
4. Verify the skill loads and is invocable.

CLAUDE.md shrinks incrementally. Skills start as local/project-scoped.

### Phase B: Install canonical plugin (one-time setup, parallel)

Install the canonical skills plugin at project level for this repo. Set to auto-update. One-time setup per project.

### Phase C: Canonicalize skills (ai-coder repo, separate)

Migrate local skills created in Phase A into the canonical plugin's public folder in the ai-coder authoring repo. Once a skill is canonical, the local copy gets replaced by the auto-updated version from the plugin.

### Steady state

- Each project has a slim CLAUDE.md (~50-80 lines) pointing to skills.
- Skills come from the auto-updating canonical plugin, committed to `.claude/skills/`.
- Web agents see everything via the committed repo clone.
- CLI agents get auto-updates when running locally.
- Review skills close the enforcement loop.
