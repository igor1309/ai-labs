---
date: 2026-05-10
model: claude-opus-4-7
description: "Loki — centralized logging stack (Grafana + Loki + Alloy on a VPS)"
---

# loki

Centralized logging stack.

## Description

Grafana + Loki + Alloy on a VPS — collects Docker container logs and journald units, with *label-bounded cardinality* enforced by allowlists and CI checks.

## Stack

- Grafana
- Loki
- Alloy
- Docker Compose
- Cloudflare Tunnel
