---
date: 2026-11-01
model: claude-opus-5-5
description: "ADR-015: pages, a read-only local viewer behind ports the composition answers"
---

# ADR-015: Pages

Pages shows a person what Agister ran and what it can run. It is a part
of the kind ADR-001 calls isolated: it imports no other package of the
module.

## Decision

Pages serves one local page and its read endpoints. It declares what it
reads as ports, in its own types; the composition answers them from the
run store and, in time, from settings. It knows no file format.

## Rules

1. **Pages only reads.** No endpoint changes a run, a setting or a file.
2. **Loopback only.** It listens on a loopback address and refuses a
   request addressed to any other host.
3. **A run's state is the one `agister status` gives.** The composition
   answers both from the same observation; pages derives no state.
4. **A run that cannot be read does not hide the others.** It is counted
   as left out, and the page says how many.
5. **A view shows what its port gives.** A view without a port is not
   served.
6. **It stops when asked.** The server ends on the context the command
   is given.
