---
date: 2026-04-30
model: claude-opus-4-7
description: Linear procedures, conventions, and project metadata for this repo. Referenced from CLAUDE.md.
---

# Linear

Canonical reference for how this repo uses Linear. CLAUDE.md links here instead of restating these rules.

## Role of Linear

Linear is an **issue tracker**. It is **not** a source of truth.

Ideas, vision, direction, scope, design notes, research, plans, and any descriptive content about the work belong in this repo (READMEs, `docs/`, ADRs, plans, `research/`, project-level docs). They do not belong in Linear project descriptions, project summaries, or issue bodies.

Linear holds:

- Issues that track concrete units of work
- Routing data: assignees, priorities, status, cycles, due dates, labels
- Comments tied to specific issues
- Pointers (URLs) back to the repo for the actual content

If a Linear description begins to describe state, vision, or direction in prose, that prose belongs in the repo. The Linear field should be trimmed to a one-line pointer with a link.

## Authoring rules for Linear content

- Project description: one short paragraph naming what the project is *for*, plus a link to the repo location that carries the real content. Do not enumerate "what exists" / "what doesn't" / "open questions".
- Project summary: one sentence, same shape.
- Issue title: imperative, concrete, scoped to a single unit of work.
- Issue body: short context + link to the repo location with details. Long prose, designs, or research notes go in the repo and are linked.

## Workspace and team

Agents should use this metadata directly instead of looking it up.

- Workspace: `igor1309`
- Team: `Igor1309` (key `IG`)

## Projects

- `ai-labs` — primary repo project
  - Project ID: `e94949cf-0479-4539-bced-7a737e5d874b`
  - Project URL: https://linear.app/igor1309/project/ai-labs-660d3af91f3e
- `course-exploration` — course-development tracking; materials live under `research/courses/` in this repo (separate Linear project because Linear has no sub-projects)
  - Project ID: `f4aa9d0e-3646-411c-8763-8239a2979937`
  - Project URL: https://linear.app/igor1309/project/course-exploration-57b12e430d17

When a new Linear project is added (or removed/renamed), update this list in the same change set.

## MCP access

Linear access is via the `linear` MCP server (user scope). Tools appear as `mcp__linear__*` deferred tools and must be loaded through ToolSearch before use.
