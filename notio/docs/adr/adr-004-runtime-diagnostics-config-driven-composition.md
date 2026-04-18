---
title: ADR-004 Runtime Diagnostics via Config-Driven Composition
date: 2026-04-18
version: 0.0.1
author: OpenAI GPT-5.4 Thinking
status: accepted
type: adr
---

# ADR-004: Runtime Diagnostics via Config-Driven Composition

## Status

Accepted

## Executive Summary

Diagnostic behavior (ack, inspect, delay, fail) is controlled through config-driven composition in the same service and on the same ingress surface as production.
No separate diagnostic service or endpoint is deployed; the real Telegram → Cloudflare → Tunnel → VPS → service path is always the path under test.
Scope: service-level diagnostic composition for infrastructure validation — not a testing framework or separate deployment.

## Context

The system is exposed through a single Telegram webhook ingress path:

`Telegram -> Cloudflare -> Tunnel -> VPS -> webhook adapter -> service`

A requirement emerged early in the setup phase:

- the runtime must support fast acknowledgment for webhook validation
- the runtime must also support deliberate failing and delaying behavior
- those behaviors are useful both for initial infrastructure bring-up and later debugging
- the discussion concerns the complete future service, not only the initial tiny adapter slice

The key concern is how to make the real service and the real ingress path testable without drifting into a separate diagnostic silo.

A parallel diagnostic deployment or separate diagnostic endpoint is undesirable because it creates a different runtime surface. In that shape, one path may appear healthy while the real production path is misconfigured or broken. That weakens confidence in the result.

## Decision

Use a single deployed service and a single real ingress surface, with runtime behavior selected through config-driven composition.

This means:

- the service remains one real application
- the webhook continues to target the real production ingress surface
- diagnostic behavior is selected by configuration rather than by deploying separate diagnostic services
- the same composition root selects real or diagnostic behavior for the relevant boundaries

The selected approach is not a separate testing service. It is the same service composed differently under explicit configuration.

## What this means in practice

The composition root may select among behaviors such as:

- fast acknowledgment
- request inspection / bounded observability behavior
- deliberate delay
- deliberate failure
- real downstream processing

Those behaviors may exist at different boundaries, including:

- webhook adapter ingress behavior
- downstream processing enablement
- faulting or delaying wrappers around selected dependencies

The source of truth for this composition is configuration.

## Why this was chosen

This preserves the one thing that matters most in this setup:

- the real Telegram -> Cloudflare -> Tunnel -> VPS -> service path remains the path under test

That avoids the diagnostic trap where an alternate service or alternate endpoint is healthy while the real ingress surface is not.

It also keeps the application architecture coherent:

- one service
- one composition model
- one real runtime path
- explicit composition choices

## Rules / Invariants

- The real Telegram → Cloudflare → Tunnel → VPS → service path MUST be the path used for infrastructure validation.
- A separate deployed diagnostic service or separate diagnostic endpoint MUST NOT be used as the primary validation surface.
- Diagnostic behavior MUST NOT be enabled by default; it MUST require an explicit configuration change to activate.
- The composition root MUST be the only place where diagnostic behavior is injected.
- Diagnostic modes MUST NOT affect behavior outside the explicitly configured boundary.
- Deliberate fail or delay modes MUST be explicitly gated and MUST require intentional operator action to enable.

## Consequences

### Positive

- infrastructure validation happens against the real ingress surface
- no separate diagnostic service needs to be maintained
- no separate endpoint needs to be trusted as representative of production
- the same application architecture supports both normal and diagnostic behavior
- the service remains testable through composition rather than runtime duplication

### Negative

- configuration becomes operationally significant
- careless configuration can activate diagnostic behavior at the wrong time
- diagnostic behavior must be tightly contained so it does not leak arbitrarily through the codebase
- safeguards are required around deliberate fail/delay behavior

## Rejected options

### 1. Separate deployed diagnostic service or endpoint

Example shape:

- one production service
- one diagnostic service
- or separate production and diagnostic endpoints

This was rejected because it creates multiple runtime surfaces.

In that model:

- the diagnostic surface may be healthy while the real production ingress is broken
- topology differences pollute the result
- diagnostic confidence becomes weaker because the tested path is no longer the real path

This was explicitly considered the main trap to avoid.

### 2. Request-scoped mode selection

Example shape:

- special request header
- query parameter
- request-local switch

This was considered weak for this concrete setup because the caller is Telegram.

In this ingress path:

- arbitrary request shaping is not under direct control
- custom request-scoped headers are not a reliable primary mechanism
- path or query based switching effectively turns into endpoint-level configuration anyway

This is not a strong primary composition strategy for the Telegram webhook path.

### 3. External fault injection as the main approach

Example shape:

- break Cloudflare routing
- stop tunnel
- route to nowhere
- inject failure outside the service

This remains useful for infrastructure validation, but it was rejected as the primary architectural answer.

Reason:

- it can validate the path around the service
- it cannot express how the service itself should compose real vs diagnostic behavior
- it does not solve service-level runtime composition

It is auxiliary, not central.

## Options considered

### Option A — Separate services / separate endpoints

Distinct deployments with different compositions.

**Advantages**
- operational separation
- easy to reason about in isolation

**Disadvantages**
- tests a different runtime surface
- can hide production-path problems
- weakens confidence in end-to-end validation

### Option B — Same service, config-driven composition

One deployed service, one ingress surface, composition chosen by config.

**Advantages**
- tests the real ingress path
- keeps one runtime surface
- avoids diagnostic silo
- keeps diagnostic behavior inside the same architecture

**Disadvantages**
- requires careful configuration control
- demands disciplined containment of diagnostic behavior

**Decision**
- selected

### Option C — Request-scoped selection

Behavior chosen per request.

**Advantages**
- targeted in theory
- no global mode flip in theory

**Disadvantages**
- poor fit for Telegram webhook ingress
- effectively collapses into config or endpoint switching in this setup
- not reliable as a primary control mechanism here

### Option D — External fault injection

Inject failure outside the service.

**Advantages**
- useful for infra-path validation
- no special diagnostic behavior needed inside the app for some cases

**Disadvantages**
- only partial answer
- does not solve service composition
- insufficient as the main design choice

## Operational note

Diagnostic behavior should be explicitly gated and intentionally activated.

How that gating is implemented is not fixed by this ADR. It may be environment-based or otherwise operationally controlled, but the governing rule is that diagnostic composition must not depend on a separate deployed surface.

## Summary

The selected approach is:

- one real service
- one real ingress surface
- config-driven composition as the source of truth for runtime diagnostic behavior

This keeps the Telegram -> Cloudflare -> Tunnel -> VPS -> service path as the actual path under test while avoiding a separate diagnostic silo.

## Non-Goals

- A testing framework or automated test suite.
- Separate diagnostic deployments or endpoints.
- Simulation of Telegram message content (diagnostics operate at the ingress boundary only).
- Replacing external fault injection for infrastructure-path validation (e.g., stopping the tunnel).
- Persistent fault-injection infrastructure.
