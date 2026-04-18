---
title: "Observability: Structured Log Forwarding"
date: 2026-04-19
model: claude-opus-4-6
description: "Wire notio structured JSON logs to Loki for persistent observability before building the capture pipeline"
status: deferred
type: note
---

# Observability: Structured Log Forwarding

## Why before capture pipeline

The capture pipeline (webhook adapter → parser → canonical item → storage) will introduce multiple failure surfaces. Debugging those without persistent, searchable logs means SSH-ing into the VPS and reading `docker logs` every time. Wiring log forwarding first means every subsequent step is observable from day one.

## Current state

- Notio emits structured JSON to stderr (one JSON object per line)
- Logs are only visible via `docker logs notio` on the VPS
- Loki + Grafana stack already runs on `95.164.53.144` (see `infra.md`)
- No log forwarding is configured for notio

## Plan

### Step 1 — Add a log driver or sidecar to forward logs to Loki

Two options:

**Option A: Docker logging driver (Loki plugin)**
- Install the Loki Docker logging driver on the notio VPS (`107.172.143.196`)
- Configure `docker-compose.yml` with the Loki log driver pointing at the Loki push endpoint on `95.164.53.144`
- Pros: zero code changes, works with existing JSON stderr output
- Cons: requires Docker plugin install on VPS, couples Docker to Loki availability

**Option B: Promtail sidecar**
- Add a Promtail container to `docker-compose.yml` that tails notio's container logs
- Configure Promtail to push to Loki on `95.164.53.144`
- Pros: standard Grafana stack pattern, decoupled from Docker logging driver
- Cons: extra container, more config surface

### Step 2 — Verify log flow

- Send a test message to `@NotioInboxBot`
- Query Loki/Grafana for `{container="notio"}` and confirm the webhook ack JSON line appears
- Verify labels: `container`, `host`, `level`

### Step 3 — Add a Grafana dashboard (optional)

- Simple panel: log volume over time, filtered by `level`
- Error rate panel if/when error logging exists

## Decision needed

Which option (A or B) fits the existing Loki setup? Check how other services on `95.164.53.144` push their logs.

## Release

This is an infra change (docker-compose + VPS config), not a code change. It may not need a notio version bump — depends on whether `docker-compose.yml` changes ship through the release pipeline.
