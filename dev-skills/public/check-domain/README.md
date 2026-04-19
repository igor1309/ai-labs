---
date: 2026-02-26
model: claude-opus-4-6
description: "Check Domain bundle — skill, agent, and MCP wiring"
---

# Check Domain Bundle

Three components distributed across the plugin:

| Component | Location | Role |
|-----------|----------|------|
| Skill | `check-domain/SKILL.md` | Knowledge: workflow, MCP tools, guidelines |
| Agent | `agents/check-domain.md` | Executor: `model: haiku`, thin system prompt |
| MCP | `.mcp.json` | Instant Domain Search streamable HTTP (plugin-level, always-on) |

## Wiring

1. User types `/check-domain example.com`
2. Skill loads (`disable-model-invocation: true` — slash command only)
3. `context: fork` + `agent: check-domain` routes to the haiku agent
4. Skill content is injected as the agent's task
5. Agent uses MCP tools described in the skill
6. `model: haiku` set on both skill (fallback) and agent

## Dependencies

- Skill → Agent: `agent: check-domain` in frontmatter
- Skill → MCP: references `mcp__instant-domain-search__*` tools
- Agent → MCP: inherits plugin-level MCP tools
- MCP is plugin-level (`.mcp.json` at plugin root), shared across all skills
