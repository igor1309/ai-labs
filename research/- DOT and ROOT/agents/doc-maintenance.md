---
date: 2026-06-02
model: claude-opus-4-8
description: "Doc-maintenance conventions — README Components table and log upkeep (read when changing components or before pushing a change set)"
---

# Doc Maintenance

When to update the README Components table and the logs.

## Project Doc Homes

- Naming briefs stay in `<project>/docs/`, not `<project>/research/` —
  research materials (evaluations, corpora, prompts) go to
  `<project>/research/`.

## README Components Table

The `## Components` table in `README.md` lists every component with its type and one-line description. Keep it current:

- Add a row when a new component (product, service, MCP tool, observability) is introduced.
- Update the Type or Description when a component's role changes.
- Remove the row when a component is deleted from the repo.

## Log

- Log entries are in reverse chronological order (newest first).
- Update the relevant log for each meaningful change set before pushing:
  - repo-level changes: `docs/log.md`
  - project-level changes: `<project>/docs/log.md` (for example, `oracle/docs/log.md`)
  - if both scopes are changed, update both logs
- Keep log entries concise and outcome-focused; don’t copy commit messages verbatim.
