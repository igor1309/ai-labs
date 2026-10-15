---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: a block on a document's base refuses the document; left out of the first cut of resolve"
---

# Blocks through extends

ADR-002, rule 7, refuses a request that depends on a blocked document.
Resolve refuses what it reaches by name; it does not see `extends`,
which documents applies before resolve is given a definition. A process
that extends a blocked base therefore resolves.

Left out of the first cut of resolve, for core first (2026-10-15): no
settings block a base yet.

## What is open

- **What the source gives.** Each document's bases, in order, by kind
  and name, from documents, which applies `extends`; a brief's too,
  given as its problems alone today.
- **How a refusal reads.** The blocked base as the last link of the
  chain, reached by `extends`, or the block named on the extending
  document.

## When

When a repository blocks a document another extends.

## Where it lands

`settings/resolve`: the source's port and `blocks.feature`;
`settings/documents`: what it gives of a document's bases.
