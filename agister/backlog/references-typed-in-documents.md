---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: documents types a reference whole, so the composition translates it to resolve's without parsing; and a query's item read outside any query is refused"
---

# References typed in documents

Resolve is given a reference as what it reads, not as its text
(`docs/settings-implementation.md`, section 6). Documents types only a
reference's root today, and keeps the rest as text: `steps.a.output`
types, and the composition would have to parse it to answer resolve.

A condition's reference to `item`, the item of an all or any query,
types anywhere in a condition; outside any query it reads nothing.
Resolve is given a condition's references flat, and does not see it.

## What is open

- **What documents gives.** A reference's root, name, and of an item,
  its outputs, one field of them, or its session; a reference that is
  none of these is a problem at typing.
- **The item outside a query.** A problem at typing, where the nesting
  of a condition is known.

## When

With the composition that answers resolve's source.

## Where it lands

`settings/documents`: `kinds.go`, `condition.go` and their features.
