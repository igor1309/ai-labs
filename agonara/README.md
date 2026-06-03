---
date: 2026-05-27
model: gpt-5
description: "Agonara backend and product docs for a structured learning program environment"
---

# Agonara

Structured learning program environment with the first Identity and Operations slice implemented.

## Description

Helps curators assemble and maintain learning programs from trusted sources, while learners progress through them with clear sequence, checkpoints, and evidence of mastery. AI assists program construction and learning support but does not own the curriculum.

## Key Separations

- **Program corpus** (topics, concepts, materials, checks, criteria) is owned by the curator
- **Student state** (answers, attempts, progress, weak areas) is owned by the learner
- **LLM output** is assistant material until a human accepts it
- **Identity** is the stable ownership and attribution subject
- **Admin** is instance-scoped operational authority, separate from program participation
- **Program Membership** owns program participation lifecycle and policy

## Stack

- Node.js 22 backend workspace
- SQLite persistence through `better-sqlite3`
- HTTP API with server-side sessions, CSRF protection, request correlation, health, diagnostics, and audit responses
- Operator CLI for bootstrap status and first-Admin bootstrap
- Docker image and Compose service for private self-hosted operation

## Demos

Local, Docker, and Admin board demo walkthroughs live in [`docs/demos.md`](docs/demos.md):

- **Identity Operations Demo** — bootstrap the first Admin via CLI, start the HTTP API, sign in, and exercise Admin operations with CSRF protection.
- **Docker Demo** — run the container and Compose service with persistent SQLite state.
- **Admin Board Demo** — drive the Admin operations board served at `/admin`.
