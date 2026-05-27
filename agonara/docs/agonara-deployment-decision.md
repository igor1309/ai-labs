---
date: 2026-05-27
model: gpt-5.5-thinking
version: 0.1.0
---

# Agonara Deployment Decision

## Decision

Agonara targets a dockerized private self-hosted deployment.

The application runtime is a private Agonara backend instance, normally running on a VPS, home server, or similar controlled server environment.

The same containerized deployment may run locally for development.

Agonara exposes an API-first backend and a network web UI as the primary human interface.

The default tenancy model is a small private group.

Agonara may use external managed storage for structured state, material storage, or supporting infrastructure.

Operational responsibility belongs to the Agonara admin of the private instance.

## Rationale

Dockerized private self-hosting keeps the production target clear while allowing the same runtime shape to be used during development.

An API-first backend prevents the core application from being coupled to a single UI surface.

A network web UI fits the small private group model better than desktop-local software.

External managed storage can reduce operational burden without changing the private-instance deployment model.