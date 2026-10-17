---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: a runtime mapping lists efforts, while the efforts a runtime accepts are its wrapper's fact"
---

# A mapping's efforts

ADR-003 (rule 7) and ADR-012 make the efforts a runtime accepts a fact
of its wrapper, and resolve checks an agent's effort against it. A
runtime mapping document still lists `efforts`
(`settings/documents/runtime.feature`); resolve reads it not.

## What is open

- **What the field is for.** Dropped, or the efforts this mapping
  offers of those the wrapper accepts, then checked too.

## When

When a mapping offers fewer efforts than its wrapper accepts, or the
owner settles the field.

## Where it lands

`settings/documents`: `runtime.go` and `runtime.feature`;
`settings/resolve`, if the mapping's list is checked.

## Seen

- 2026-10-16: no codex model on the owner's login accepts `minimal`,
  which `home/runtimes/codex.yaml` and the codex wrapper's facts list;
  `gpt-6.1-sol` rejects it. The end-to-end check uses `low`.
