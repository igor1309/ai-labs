---
date: 2026-06-06
model: gpt-5
description: "Deployment discipline for Agonara"
---

# Deployment Discipline

## Rules

- Treat ADR-017 and `docs/deployment-handoff.md` as the source of truth.
- Use inventory for live host details; do not copy VPS addresses, domains, or secrets into this repo.
- Do not print secret values. Redact env files, tokens, keys, and bootstrap secrets.
- Deploy scripts must assume a Docker-only host: no host Node.js, npm, app deps, or package managers.
- Build the new image before stopping a running container.
- Tag built images with both version and git sha.
- Keep app containers loopback-only; public access belongs behind reverse proxy TLS.
- Health checks must use tools present in the runtime image.
- Env files with secrets stay `0600`; deployed non-secret source files must have normal readable modes.
- Runtime app files in the image must be readable by the non-root app user.
- Rollback must health-gate service availability, not the failed deploy's target version.
- After live VPS changes, update the relevant inventory log/current-state docs.
