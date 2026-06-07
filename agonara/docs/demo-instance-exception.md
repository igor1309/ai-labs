---
date: 2026-06-07
model: claude-opus-4-8
description: "Sketch: a public, ephemeral demo Agonara instance as a deliberate, scoped exception to ADR-017's private-not-multitenant boundary, giving an evaluator's agent a target before they commit to self-hosting."
---

# Demo-Instance Exception (Sketch)

> **Status: sketch — not accepted.** This is an exploration of an optional BYOA
> on-ramp. Because it deliberately crosses ADR-017's private-default boundary, it
> MUST NOT be built until its own ADR accepts the exception, its guardrails, and
> its operational ownership. This document exists to frame that decision, not to
> authorize work.

## Context

The BYOA promise is "point the agent you already use at *your* Agonara
instance." The committed way to *have* an instance is to self-host one
(ADR-017; paved-path plan in
[`plans/byoa-self-host-paved-path.md`](plans/byoa-self-host-paved-path.md)).
That is the right model for real use, but it creates a cold-start gap for
evaluation: someone assessing whether BYOA is worth the self-host effort has
**nothing to point an agent at** until they have already done the self-host
effort. The agent-connection experience — the thing BYOA is selling — is
unreachable until after the commitment it is meant to justify.

A public, ephemeral **demo instance** would close that gap: a target an
evaluator's agent can connect to in minutes, exercise a role skill against, and
then decide to self-host for real.

## Tension with ADR-017

ADR-017 commits Agonara to a **private instance for a small group or individual,
not public multi-tenant SaaS**, and explicitly **rejected** managed-SaaS-first.
A publicly reachable demo instance is, on its face, in tension with that
"private" default. So this is not a free addition — it is a **deliberate, scoped
exception** that must be bounded tightly enough that it cannot drift into the
rejected SaaS posture.

The exception is defensible only if it stays a *demo*, not a *product*:

- It is **one** instance, not multi-tenant infrastructure with per-customer
  isolation, billing, or support.
- It holds **no real user data** and makes **no durability promise**.
- It is an **evaluation artifact**, owned and operated like a marketing demo,
  not an account a user comes to depend on.

If any of those erode, the demo has become the SaaS that ADR-017 rejected, and
the exception is void.

## Proposed shape

- **Single seeded instance.** One Agonara instance, pre-loaded with a small
  curated demo program (sources, corpus, checks) so an agent has something real
  to operate on immediately.
- **Ephemeral and auto-reset.** State resets on a fixed schedule (and/or on
  demand). Nothing a visitor creates is expected to survive a reset; the landing
  copy says so plainly.
- **Sandboxed identities.** Either a shared pre-bootstrapped demo role set, or
  disposable self-serve identities that the reset reclaims. No real credential
  lifecycle, no recovery guarantees.
- **Bounded LLM exposure.** Open-answer evaluation and LLM-assisted suggestions
  are the obvious abuse/cost surface. The demo runs with a tightly budgeted,
  rate-limited, demo-only provider key (or a deterministic stub provider), never
  a real private instance's keys.
- **Fully isolated.** Separate host/container, separate throwaway secrets,
  separate data volume — no shared failure domain or secret material with any
  private instance, including the author's.
- **Clearly labeled.** Every exposed surface (landing link, `/learn`, and — only
  if the admin-access decision below permits — `/admin`) marks it as an ephemeral
  public demo that resets and is not for real data.

## Explicit non-goals

- Not multi-tenant SaaS, not per-user isolation, not persistent accounts.
- Not a hosted offering or a path to one — it does not reopen ADR-017's
  SaaS-first rejection.
- Not a replacement for self-hosting. It reduces evaluation friction; the real
  route to owning an instance remains the self-host paved path.
- Not a store of any data a visitor should care about keeping.

## Guardrails the exception ADR must pin

- Reset cadence and the guarantee that no visitor data persists across resets.
- Rate limiting and provider-cost ceiling for the LLM-backed surfaces.
- Abuse posture for a publicly writable, LLM-backed app (what a visitor can and
  cannot trigger).
- Isolation from all private instances (host, secrets, volumes).
- Public `/admin` exposure: the deployment handoff's standing decision blocks
  public `/admin` at the reverse proxy
  ([`deployment-handoff.md`](deployment-handoff.md) Active Follow-Up). The demo
  must either keep `/admin` unexposed (demo runs `/learn` only) or have its ADR
  explicitly revisit that block for the isolated demo host — it cannot silently
  override a standing operational decision.
- Operational ownership: who runs, resets, and retires the demo, and the cost
  budget it lives within.
- A retirement/off-switch criterion, so a demo that is not earning its keep can
  be removed without ceremony.

## Open questions

- Shared demo identities vs. disposable self-serve identities — which gives a
  truer BYOA feel without inviting abuse?
- Real budgeted provider key vs. deterministic stub provider for the demo's
  evaluation surfaces?
- Does the demo live on the same `agonara-vps` host (cheap, but shares a failure
  domain and blast radius) or a throwaway host (cleaner isolation, more ops)?
- Is a demo even the lowest-friction on-ramp, or would a recorded
  agent-against-instance walkthrough deliver most of the value with none of the
  public-instance risk?

## Decision needed

Before any implementation:

1. An ADR that accepts (or rejects) the demo-instance exception, pins the
   guardrails above, and states how it coexists with ADR-017's private-default
   boundary without reopening the SaaS-first rejection.
2. If accepted, an implementation plan that treats isolation, reset, and LLM
   cost-bounding as first-class, not afterthoughts.

This sketch is the input to step 1, not a substitute for it.
