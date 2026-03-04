# ai-labs

Applied AI experiments and systems engineering.

## Components

| Component | Type | Description |
|-----------|------|-------------|
| oracle | Product | AI-powered web app (Cloudflare Pages + Workers) |
| nomos | Service | LLM access control proxy — auth, cost budgets, unified API |
| corpus-scout | MCP tool | Lexical search and section reading over a local text corpus |
| web-scout | MCP tool | Web search via SearXNG |
| loki | Service (on hold) | Centralized logging stack (Loki + Grafana + Alloy) |
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
