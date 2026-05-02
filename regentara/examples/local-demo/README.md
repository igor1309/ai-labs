---
date: 2026-04-28
model: gpt-5
description: "Regentara local demo smoke path"
---

# Regentara Local Demo

## Smoke Command

From the repository root:

```bash
node regentara/examples/local-demo/run-demo.js --fake-providers
```

The command runs Regentara from this demo workspace with fake provider execution, fake CLI availability, the checked-in `task.md`, and the demo review-fix policy, so it does not require provider credentials. The output includes the run ID, status, and run directory. Progress events are written to `events.jsonl` inside the reported run directory.

## Settings

The checked-in `agents.yaml` and `models.yaml` mirror the runtime bootstrap examples in `src/settings/example-bootstrap.js`. The `.regentara/` copies make this directory usable as the workflow workspace.
