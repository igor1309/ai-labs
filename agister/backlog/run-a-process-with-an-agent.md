---
date: 2026-10-14
model: claude-opus-5-5
description: "Backlog: run a process with an agent without writing a call workflow"
---

# Run a process with an agent, without a workflow file

A caller who wants one process's opinion, such as an architecture review,
has to write a `call` workflow binding it to an agent first. Trying a
process on another agent means another file.

A shortcut would let a request name a process and an agent. Resolve would
answer it with the same one-node `call` workflow it gives for a workflow
document, so core, the record and continuation do not change; the record
keeps the definition as resolved, and blocks apply as for any reference.

- **Where:** a request form of `settings/resolve` (ADR-002, rule 6), not
  `cli`, which only parses and calls its port (ADR-001, rule 1).
- **Cost:** the runs, check and pages views show a workflow no file holds.
- **When:** when writing the file is met as a real cost (ADR-001,
  invariant 9).
