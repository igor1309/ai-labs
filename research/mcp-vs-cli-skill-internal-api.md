---
date: 2026-06-16
model: claude-opus-4-8
description: "Summary of Yandex's benchmark comparing MCP vs CLI + Skill for AI agents working with internal APIs"
---

# MCP vs CLI + Skill for AI Agents on Internal APIs

Source: [habr.com/ru/companies/yandex/articles/1046191](https://habr.com/ru/companies/yandex/articles/1046191/)
— Daniil Mikhailov (f1xgun), Yandex. Russian-language article on Habr.

## Summary

The article compares two architectural approaches for connecting AI agents to
internal APIs, measured by token/context cost rather than by ergonomics:

1. **MCP (Model Context Protocol)** — plug-and-play integration with a
   standardized JSON Schema tool format.
2. **CLI + Skill** — a command-line tool plus a markdown "skill" doc that
   teaches the agent how to use it, giving full control over documentation size
   and output format.

The driving constraint is the LLM context window: tool descriptions, parameter
schemas, and intermediate results all consume tokens that would otherwise go to
solving the task. The team ran 14 scenarios across 400+ runs on two model sizes
to find which approach is cheaper under different workloads.

## Key Findings

### Eager vs. lazy loading reshaped the comparison

The decisive variable is how tool schemas are loaded:

- **MCP eager** — all tool schemas loaded every request (87 tools ≈ 39,000
  tokens of overhead).
- **MCP lazy** — only ~200 tokens for tool names up front; full schemas fetched
  on demand.

Lazy loading collapsed MCP's overhead and changed which approach wins where.

### Documentation optimization is mandatory for CLI + Skill

The team cut skill documentation by 92% (19,504 → 1,628 characters) and tested
three variants:

- **Original** — full docs with examples.
- **Medium** — compact command list (−78%).
- **Optimized** — minimal version that defers to `--help` (−92%).

Without this optimization, CLI + Skill underperformed in many scenarios. The
skill doc is treated as an engineered interface, not an afterthought.

### Output-shaping techniques (CLI side)

- `--json` for structured responses
- `--compact` to drop fields
- `--page-size` to cap result counts
- aggregated commands instead of sequential calls

### Representative context costs

- MCP eager: ~246K tokens on simple tasks
- MCP lazy: ~76K tokens
- CLI medium: predictable ~60K tokens

## When Each Wins

| Workload | Winner |
|---|---|
| Simple queries (PR status, tickets) | MCP lazy |
| Routine daily tasks | CLI + Skill (medium) — 30–52% savings |
| Complex multi-step workflows | CLI + Skill (original) — up to 5.5× more efficient |
| Heavy input-data scenarios | MCP eager |

## Conclusion

There is **no universal winner** — the right choice depends on which workload
dominates. Pick MCP lazy for simple requests, CLI + Skill (medium docs) for
routine workflows, CLI + Skill (full docs) for complex multi-step scenarios, and
MCP eager when inputs are data-heavy. Regardless of approach, documentation
deserves the same engineering rigor as any user interface.
