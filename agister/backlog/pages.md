---
date: 2026-10-14
model: claude-opus-5-5
description: "Backlog: pages, a read-only local viewer; its ADR waits"
---

# Pages

Pages has no ADR yet. The archived pages (`archive/pages/README.md`,
archive ADRs 009 and 011) does far more than those two ADRs say.

## What the archive does

- **Settings:** every workflow, process and building block, composed as a
  launch from the chosen directory would see them, with the layer each
  field came from; what each node binds and gets; what is missing.
- **Runs:** home's runs, one run's result rendered, a workflow's nodes
  and its join's rulings.
- **Compare:** per process, outcomes by runtime, model and effort.
- **Knowledge:** per agent, the skills its settings name and those its
  runtime loads, their checks, and the skills observed in runs.
- Any repository can be viewed, through a folder picker.
- It only reads, and serves loopback only.

## Ports, not files

The archive's composition hands pages Agister's own settings composition,
the run store (running or lost) and the folder dialog
(`pages.Env{Settings, Observe, Choose}`): ports in all but name. ADR-001
makes pages a read-only viewer and leaves how it gets settings and runs
to its ADR: through ports the composition answers.

Its tests follow ADR-009: pages is tested over spies on its ports, so its
ADR gives it ports for what it reads.
