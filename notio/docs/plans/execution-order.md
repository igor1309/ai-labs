---
title: Notio Execution Order
date: 2026-04-19
model: claude-opus-4-6
description: "Locked execution order for notio post-bring-up work"
status: active
type: note
---

# Notio — Execution Order

## Rule

Execute in this order. Do not skip or reorder. Each phase must be complete before starting the next.

## Phases

1. [x] **Observability** — deferred. Single container, `docker logs` + `inspect` mode sufficient. Revisit when Loki stack is live or second service exists. (`observability-structured-log-forwarding.md`)
2. [x] **Diagnostic modes** — inspect, delay, fail implemented (`diagnostic-modes-inspect-delay-fail.md`)
3. [ ] **Capture pipeline** — webhook adapter → parser → canonical item → storage (`next-slice-capture-pipeline.md`)
