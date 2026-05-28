---
date: 2026-02-26
model: claude-opus-4-6
description: "Next steps for the check-domain skill"
---

# TODO

## MCP context cost

Plugin-level `.mcp.json` makes Instant Domain Search MCP always-on for all 12 dev-skills. Track context cost. If too taxing:
- [ ] Option A: move check-domain to a separate plugin (`igor1309/check-domain`)
- [ ] Option B: drop `.mcp.json`, switch skill to direct API calls via curl
- [ ] Option C: wait for per-skill MCP scoping if Claude Code adds it

## Feature backlog

- [ ] Verify actual MCP tool names with `/mcp` after connecting the server
- [ ] Test the full workflow: quick check, alternatives, verification
- [ ] Add brainstorming session workflow (gather context → variations → verify)
- [ ] Add bulk validation workflow (accept list → batch verify → structured results)
- [ ] Create `references/workflow-patterns.md` (competitor analysis, TLD strategy, brand-safe filtering)
- [ ] Investigate `context: fork` not routing to haiku agent
