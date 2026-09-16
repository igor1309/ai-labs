---
date: 2026-07-20
model: unknown
description: "Subagent step sizing — delegate additive, well-isolated steps; execute cross-cutting atomic work inline"
---

# Subagent Step Sizing

Delegate additive, well-isolated implementation steps (new files plus their own
tests, DoD checkable from those files alone) to executor subagents. Execute
atomic cross-cutting work — deletions, renames, restructures landing as one
commit — inline as the orchestrator.

The test: will you re-verify the whole diff yourself anyway? If yes, the
subagent saves little, and a mid-step subagent death (session limit, model
outage) leaves a large unverified working tree that costs a full inline diff
review to recover — which is also where subagent-missed defects surface
(observed on DBSNEW-17101 Phase-4, 2026-07-18: the interrupted executor's
tree hid a test defect its report never mentioned).
