# ai-labs

![ai-labs](img/image.PNG)

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
| notio | Product family | Personal capture + browse system split into `notio-backend` and `notio-frontend` release units |
| notio-backend | Release unit | Swift/Hummingbird Telegram capture service, Supabase schema/migrations owner, Docker-producing VPS deployable |
| notio-frontend | Release unit | Svelte/Vite Supabase browse client, Cloudflare Pages deployable |
| oracle | Product | AI-powered web app (Cloudflare Pages + Workers) |
| regentara | CLI release unit | Provider-agent workflow orchestrator for governed coding loops |
| nomos | Service | LLM access control proxy — auth, cost budgets, configurable request body limits, unified API |
| corpus-scout | MCP tool | Lexical search and section reading over a local text corpus |
| web-scout | MCP tool | Web search via SearXNG |
| loki | Service (on hold) | Centralized logging stack (Loki + Grafana + Alloy) |
| claude-insights | Service | Weekly Claude Code usage aggregator with Telegram bot and LLM trend analysis |
| session-digest | CLI | Converts Claude Code JSONL sessions into persisted local ledgers and bounded-model Markdown digests |
| docker/langfuse | Observability | Shared Langfuse v3 instance for tracing and cost tracking |
| dragoman | Editorial channel | "The Dragoman" Telegram channel — brand brief, channel vision, and post backlog |
| clipdeck | Product (docs-only) | iPhone-friendly private webpage that lists reusable prompts and skills with one-tap copy, front matter stripped server-side |

## Architecture

Architecture Decision Records (ADRs) live in `docs/adr/`, organized by domain:

- `docs/adr/release/` — Release architecture (ADR-000 through ADR-006): independent per-unit releases, config-driven discovery, tag-based detection, Docker image tagging.
- ADR governance (structure template, review standard, implementation plan requirements) is bundled in the `adr-governance` skill (`dev-skills/public/adr-governance/references/`).

## Releases

Each project is an independent release unit. Releases are trunk-only, semver-based, and tag-driven (`<basename>_v<version>`). See `release-units.config.toml` for configured units and `release-units.toml` for the current manifest. Full release policy is in `CLAUDE.md` under "Release Process".

## LOC Dashboard

```bash
# sorted by project name (default)
bash scripts/loc-dashboard.sh

# sorted by total descending
bash scripts/loc-dashboard.sh --sort=total
```
