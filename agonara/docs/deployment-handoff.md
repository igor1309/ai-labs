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

**BYOA self-host paved path.** ADR-017 commits Agonara to operator-self-hosted
private instances, yet the only existing deployment path is the author's
CI-driven release to agonara-vps; there is no host-agnostic, operator-facing
"stand up your own instance" route. Until one exists and a non-author has run it
end to end, the BYOA "point your agent at your instance" claim has no backing
path to *having* an instance. Plan:
[`plans/byoa-self-host-paved-path.md`](plans/byoa-self-host-paved-path.md).

**Demo/trial instance exception (optional on-ramp).** A public, ephemeral demo
instance would give an evaluator's agent a target before they commit to
self-hosting. This is a deliberate, scoped exception to ADR-017's
private-not-multitenant boundary and needs its own decision. Sketch:
[`demo-instance-exception.md`](demo-instance-exception.md).

**Hermes skill auto-deploy (operator/inventory owned).** Drafted handoff to
automate pushing the student-bot skill set from ai-labs to the live Hermes
agent; implementation and run belong to the operator inventory, not ai-labs.
Package: [`hermes-skills-deploy-handoff.md`](hermes-skills-deploy-handoff.md).

**Future Admin access layer.** Public `/admin` is blocked at Caddy for now.
Operators use private loopback/SSH access.

If browser Admin access is needed later, decide and document the outer access
layer in its own ops note or ADR. Candidate shapes are Cloudflare Access, VPN,
or a narrowly scoped allowlist. Agonara's own Admin session and CSRF controls
must remain in place behind any outer gate.

Changing this decision must update the owning access-layer doc and release
workflow expectations.
