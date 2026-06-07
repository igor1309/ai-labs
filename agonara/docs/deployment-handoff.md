---
date: 2026-06-07
model: gpt-5
title: agonara-deployment-handoff
description: "Deployment index for Agonara after the first production release; routes readers to source-of-truth docs and active operational follow-ups."
version: 0.4.0
purpose: "Keep deployment handoff context short after deployment is complete."
rules:
  - "Do not use this file as a log, release note, runbook, live state inventory, or implementation checklist."
  - "Do not duplicate release-process, workflow, ADR, spec, closeout, README, or operational-inventory content."
  - "Move implemented or historical detail to the owning doc, playbook, closeout, release record, log, README, or inventory, then link it here only if needed."
  - "Do not add long prose; keep this file short: target 40-70 lines."
---

# Agonara Deployment Handoff

## Purpose

Agonara deployment is complete. This file is now a small index for deployment
ownership and follow-up routing.

## Standing Decisions

- [ADR-017 - Private-Instance Deployment Operational Boundary](adr/adr-017-private-instance-deployment-operational-boundary.md).
- [ADR-018 - Open-Answer Evaluator Real-Provider Runtime](adr/adr-018-open-answer-evaluator-real-provider-runtime.md) and
  [Open-Answer Evaluator Real-Provider Runtime](specs/open-answer-evaluator-real-provider-runtime.md).
- [Bootstrap Secret Lifecycle](bootstrap-secret-lifecycle.md).
- [Release Process Addendum](../../.agents/release-process.md).

## Active Follow-Up

**Future Admin access layer.** Public `/admin` is blocked at Caddy for now.
Operators use private loopback/SSH access.

If browser Admin access is needed later, decide and document the outer access
layer in its own ops note or ADR. Candidate shapes are Cloudflare Access, VPN,
or a narrowly scoped allowlist. Agonara's own Admin session and CSRF controls
must remain in place behind any outer gate.

Changing this decision must update the owning access-layer doc and release
workflow expectations.
