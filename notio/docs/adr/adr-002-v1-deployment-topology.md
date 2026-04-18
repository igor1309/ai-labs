---
title: ADR-002 V1 Deployment Topology
date: 2026-04-17
version: 0.0.1
status: accepted
model: GPT-5.4 Thinking
category: adr
---

# ADR-002: V1 Deployment Topology

## Status
Accepted.

## Executive Summary

v1 deploys as a single VPS-hosted process behind Cloudflare Tunnel, using Telegram webhook delivery at `inbox.enoa.ai`.
The ingress adapter and capture service are logically separate but may run in one process.
Scope: deployment topology and runtime shape for v1 only — no separate process boundaries required yet.

## Context
The first ingress is a Telegram bot.
The chosen delivery mode is webhook, not polling.
The public hostname is intended to live under `inbox.enoa.ai`.
The runtime target is a VPS.

The design should preserve clean internal boundaries while keeping v1 operations simple.

## Decision
The v1 system is deployed with:
- public HTTPS ingress at `inbox.enoa.ai`
- Telegram webhook delivery
- Cloudflare at the edge
- Cloudflare Tunnel from the public hostname to the VPS-hosted application
- application running on a VPS
- logical separation between ingress adapter and capture service even if deployed together in one process

## Runtime shape
The practical request path is:

`Telegram -> https://inbox.enoa.ai/<secret-webhook-path> -> Cloudflare -> Cloudflare Tunnel -> VPS application`

The application contains, at minimum:
- Telegram webhook adapter
- capture service
- enrichment clients/dependencies
- configured storage implementation

## Why this topology
### Telegram webhook over polling
Chosen because webhook is the intended production ingress shape and fits a stable hosted endpoint.

### Cloudflare edge + Tunnel
Chosen because it provides:
- public HTTPS endpoint
- no need to expose inbound ports directly on the VPS
- cleaner edge-to-origin setup
- future flexibility for additional HTTP ingress use cases

### VPS-hosted app
Chosen because v1 does not require a more complex runtime model.
A single VPS is sufficient.

### Logical split, optional monolithic deployment
The ingress adapter and capture service remain separate in design.
They may still be deployed as one process in v1 to keep operations simple.

## Rules / Invariants

- The Telegram webhook endpoint MUST be public HTTPS.
- A secret webhook path MUST be used.
- The application MUST tolerate enrichment and persistence failures cleanly.
- Structured logging MUST be present.
- Secrets for Telegram and storage backends MUST be isolated from source code and deployment config.

## Non-Goals
This ADR does not fix:
- specific Swift server framework
- exact Cloudflare Tunnel configuration
- exact retry/backoff policy
- exact storage backend choice
- exact storage schema
- exact security hardening details beyond the chosen deployment shape

## Consequences
### Positive
- production-shaped ingress from the start
- clean public hostname
- no direct inbound VPS exposure required
- simple runtime footprint for v1
- future ingress expansion remains possible

### Negative
- introduces Cloudflare as an operational dependency
- webhook handling requires a reliable public endpoint from day one
- tunnel and edge diagnostics become part of ops

## Rejected directions
### Polling as v1 ingress
Rejected because webhook is a better fit for the intended hosted setup.

### Forcing separate deployables immediately
Rejected because the runtime complexity is unnecessary for v1.
Logical boundaries are sufficient at this stage.
