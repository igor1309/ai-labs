# ai-labs

Applied AI experiments and systems engineering.

This repo also holds a reusable library of agent-oriented instructions, prompts, skills, and exploratory tooling for AI-assisted development.

## Agent-Agnostic Instructions

AI tools and interfaces change quickly. The repo treats high-quality instructions as durable, version-controlled assets rather than tool-specific glue.

The practical split is between:

- `migrate-to-skills/guides/` for foundational context, methodologies, and style guides that teach an agent how to think about a task
- `prompts/` for focused one-shot instructions that tell an agent what to do next

The usual pattern is to combine a guide with a prompt when working with a chosen agent.

`CLAUDE.md` is the canonical agent instruction file. `AGENTS.md` is a symlink to it — do not reverse the direction (web-based agents cannot follow symlinks).

## Structure

| Path | Purpose |
|------|---------|
| `migrate-to-skills/guides/` | Foundational methodologies and style guides for AI-assisted work |
| `prompts/` | Focused one-shot task instructions |
| `dev-skills/` | Development workspace for Claude Code skills; published to `igor1309/skills` |
| `tools/` | Small shell utilities and local workflow helpers |
| `sandbox/` | Experiments and WIP explorations |
| `insights/` | Notes on AI tooling and usage patterns |
| `reading/` | Reading notes and curated references |
| `debates/` | Long-form debates and synthesis docs |
| `gemini/` | Gemini-specific prompt and workflow notes |

## AI Tooling

- Skills are developed in `dev-skills/public/` and synced to `igor1309/skills` on push to `trunk`
- `sandbox/`, `research/`, and `archive/` are excluded from publish via `dev-skills/public/.publishignore`
- Published skills can be installed with `/plugin marketplace add igor1309/skills`

## Components

| Component | Type | Description |
|-----------|------|-------------|
| nexum | Product | Private single-user repo memory system (full Swift stack) |
| notio | Product | Personal capture service: Telegram → canonical item → storage adapter (Swift + Hummingbird) |
| oracle | Product | AI-powered web app (Cloudflare Pages + Workers) |
| nomos | Service | LLM access control proxy — auth, cost budgets, unified API |
| corpus-scout | MCP tool | Lexical search and section reading over a local text corpus |
| web-scout | MCP tool | Web search via SearXNG |
| loki | Service (on hold) | Centralized logging stack (Loki + Grafana + Alloy) |
| claude-insights | Service | Weekly Claude Code usage aggregator with Telegram bot and LLM trend analysis |
| docker/langfuse | Observability | Shared Langfuse v3 instance for tracing and cost tracking |

## Architecture

Architecture Decision Records (ADRs) live in `docs/adr/`, organized by domain:

- `docs/adr/release/` — Release architecture (ADR-000 through ADR-006): independent per-unit releases, config-driven discovery, tag-based detection, Docker image tagging.
- `docs/adr/governance/` — ADR structure template, review standard, and implementation plan requirements.

## Releases

Each project is an independent release unit. Releases are trunk-only, semver-based, and tag-driven (`<basename>_v<version>`). See `release-units.config.toml` for configured units and `release-units.toml` for the current manifest. Full release policy is in `CLAUDE.md` under "Release Process".

## LOC Dashboard

```bash
# sorted by project name (default)
bash scripts/loc-dashboard.sh

# sorted by total descending
bash scripts/loc-dashboard.sh --sort=total
```
