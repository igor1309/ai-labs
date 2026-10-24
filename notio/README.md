---
date: 2026-04-24
model: gpt-5
description: "Notio project overview and release architecture references"
---

# Notio

Landing page: frontend/index.html

Notio is a personal capture service: send a link or a short note from Telegram, and it lands in a persistent inbox through a storage adapter. Telegram is only an ingress — the core is independent of Telegram, GitHub, Markdown, and any specific backend.

## Goals

- make capture frictionless
- keep the core independent from any ingress or storage
- lightweight non-AI enrichment for links
- persist immutable canonical items in v1
- allow future storages (GitHub-backed, Supabase-backed, others)

## Non-goals (v1)

- AI summarization
- tags, editing, deduplication
- read/query flows in the capture service
- command-based Telegram UX

## Supported input (v1)

A Telegram message may be a link, a link with a note, or a note only. Rules:

- if multiple URLs are present, the first is the primary source; the rest stay in the note
- every normal message is treated as capture content — no explicit command required

## Core flow

1. Telegram webhook ingress receives the message
2. core parses and normalizes the input
3. kind is determined (`link` | `note`) and source type classified (`github_repo` | `web_page`)
4. best-effort, non-AI enrichment runs (GitHub repo metadata or generic title/description)
5. a canonical, storage-independent item is persisted through the storage interface
6. two-phase feedback is attempted: immediate receipt acknowledgement, then final outcome (success/failure)

If enrichment fails, the item is still persisted. Enrichment outcome is recorded as `full` | `partial` | `failed` | `none`. Feedback delivery failure does not affect capture outcome.

## Architecture

Four parts:

- **Ingress adapter** — thin; receives webhook, extracts payload, forwards to core.
- **Capture core** — parsing, normalization, enrichment orchestration, submission to storage.
- **Storage interface** — async, write-only; success or failure, no read-back in capture.
- **Storage implementation** — owns identity, layout, and representation (e.g. Markdown files, rows, documents).

The core persists canonical data, not Markdown. If a storage adapter renders Markdown, that's a storage detail.

Design avoids the trap of **"Telegram bot that writes Markdown to GitHub"** — that is one implementation, not the architecture.

Authoritative design lives in [`docs/adr/`](docs/adr/):

- [ADR-001 — capture system boundaries](docs/adr/adr-001-capture-system-boundaries.md)
- [ADR-002 — v1 deployment topology](docs/adr/adr-002-v1-deployment-topology.md)
- [ADR-003 — Supabase-backed storage](docs/adr/adr-003-supabase-backed-storage-implementation.md)
- [ADR-004 — runtime diagnostics via config-driven composition](docs/adr/adr-004-runtime-diagnostics-config-driven-composition.md)
- [ADR-005 — tag-driven CI/CD to VPS](docs/adr/adr-005-tag-driven-cicd-to-vps.md)
- [ADR-006 — capture feedback as cross-cutting concern](docs/adr/adr-006-capture-feedback-as-cross-cutting-concern.md)
- [ADR-007 — frontend and backend release split](docs/adr/adr-007-frontend-backend-release-split.md)

Frontend ADRs are tracked separately under [`docs/frontend/adr/`](docs/frontend/adr/):

- [Frontend ADR-001 — frontend architecture for mvp_01 browse client](docs/frontend/adr/ADR-001-frontend-architecture-mvp01-supabase-browse.md)
- [Frontend ADR-002 — auth model for mvp_01 read-only Supabase frontend](docs/frontend/adr/ADR-002-auth-model-mvp01-readonly-supabase-frontend.md)
- [Frontend ADR-003 — mvp_01 product scope for read-only browse frontend](docs/frontend/adr/ADR-003-mvp01-product-scope-readonly-browse-frontend.md)
- [Frontend ADR-004 — read-model contract for mvp_01 browse](docs/frontend/adr/ADR-004-read-model-contract-mvp01-browse.md)
- [Frontend ADR-005 — single-user data model for mvp_01 frontend](docs/frontend/adr/ADR-005-single-user-data-model-mvp01-frontend.md)
- [Frontend ADR-006 — platform, hosting, and repo layout for mvp_01 frontend](docs/frontend/adr/ADR-006-platform-hosting-repo-layout-mvp01-frontend.md)
- [Frontend ADR-007 — frontend deployment verification by page version](docs/frontend/adr/ADR-007-frontend-deployment-verification-page-version.md)
- [Frontend ADR-008 — local browser testing for mvp_01 frontend](docs/frontend/adr/ADR-008-local-browser-testing-mvp01-frontend.md)

Specs: [`docs/specs/`](docs/specs/). Plans: [`docs/plans/`](docs/plans/).

## Stack overview

Swift 6.1 + [Hummingbird 2](https://github.com/hummingbird-project/hummingbird). Single executable (`NotioServer`) built from the `NotioApp` library. Deployed as a Docker container behind Cloudflare Tunnel.

Backend files live under [`backend/`](backend/). Frontend files live under [`frontend/`](frontend/). Product docs remain under [`docs/`](docs/).

## Deployment topology (v1)

`Telegram → https://inbox.enoa.ai/<secret-webhook-path> → Cloudflare → Cloudflare Tunnel → VPS (Swift/Hummingbird app in Docker)`

One process initially; ingress and core stay logically separate.

## Endpoints

| Path                      | Method | Description                                         |
|---------------------------|--------|-----------------------------------------------------|
| `/health`                 | GET    | Liveness probe (`{"status":"ok"}`)                  |
| `/version`                | GET    | Deployed version (`{"version":"..."}`)              |
| `/<NOTIO_WEBHOOK_PATH>`   | POST   | Telegram webhook receiver; acks per diagnostic mode |

## Environment variables

| Variable                       | Required | Default | Description                              |
|--------------------------------|----------|---------|------------------------------------------|
| `NOTIO_WEBHOOK_PATH`           | yes      | —       | Secret webhook path segment              |
| `NOTIO_PORT`                   | no       | `8080`  | HTTP listen port                         |
| `NOTIO_VERSION`                | no       | `dev`   | Reported by `/version`                   |
| `NOTIO_TELEGRAM_BOT_TOKEN`     | normal   | —       | Telegram bot token for feedback; required in normal mode, optional in diagnostic mode |
| `NOTIO_SUPABASE_URL`           | no       | —       | Supabase project URL; enables Supabase persistence when set |
| `NOTIO_SUPABASE_KEY`           | no       | —       | Supabase service-role key; enables Supabase persistence when set |
| `NOTIO_DIAGNOSTIC_MODE`        | no       | —       | `ack` \| `inspect` \| `delay` \| `fail`              |
| `NOTIO_DIAGNOSTIC_DELAY_MS`    | no       | `5000`  | Delay for `delay` mode; ignored otherwise            |
| `NOTIO_DIAGNOSTIC_FAIL_STATUS` | no       | `500`   | HTTP status for `fail` mode; ignored otherwise       |

## Local development

Run backend commands from `notio/backend/`.

```bash
swift test              # unit tests
swift build             # debug build
NOTIO_WEBHOOK_PATH=test-webhook NOTIO_TELEGRAM_BOT_TOKEN=test-bot-token NOTIO_SUPABASE_URL=https://example.supabase.co NOTIO_SUPABASE_KEY=test-service-role-key swift run NotioServer
```

Docker:

```bash
docker build -t notio:dev .
docker run --rm -p 8080:8080 -e NOTIO_WEBHOOK_PATH=test -e NOTIO_TELEGRAM_BOT_TOKEN=test-bot-token -e NOTIO_SUPABASE_URL=https://example.supabase.co -e NOTIO_SUPABASE_KEY=test-service-role-key notio:dev
```

Diagnostic-only local run without Telegram feedback or persistence:

```bash
NOTIO_WEBHOOK_PATH=test-webhook NOTIO_DIAGNOSTIC_MODE=ack swift run NotioServer
```

Run the frontend local browser-testing runtime from `notio/frontend/`.

```bash
npm run dev:local
```

This serves the same Svelte app through Vite with deterministic in-memory auth and browse data. It is for local browser inspection only: it uses mock local data and does not validate Supabase RLS, magic-link delivery, network behavior, or real database ordering.

## Release

Notio is split into independently released backend and frontend units. Backend tags follow `notio-backend_v<version>`; frontend tags follow `notio-frontend_v<version>`. Historical `notio_v<version>` tags remain pre-split backend releases. Release checklist guidance is in [docs/release.md](docs/release.md); full policy is in repo-level `docs/adr/release/` and [ADR-007](docs/adr/adr-007-frontend-backend-release-split.md).

## Status

v1 capture pipeline with two-phase feedback (`notio-backend_v0.3.0`): full parse → enrich → persist flow with Telegram receipt and outcome feedback. Telegram messages are parsed (URL extraction with UTM stripping, entity/regex fallback), source-classified (`github_repo` | `web_page`), enriched (GitHub API metadata or HTML title/description extraction), and persisted to Supabase. Each capture request receives an immediate receipt acknowledgement and a final success/failure message. Service deployed on VPS, `@NotioInboxBot` webhook live at `inbox.enoa.ai`. History: [`docs/log.md`](docs/log.md).

## Future directions

- additional source-specific enrichers
- tags and AI-assisted summarization
- query/read/edit clients
- multiple storage implementations in parallel
- reprocessing of previously captured items

## Description

Send a link or a note from Telegram and it lands in a persistent inbox. The core is *ingress- and storage-agnostic* — Telegram is just one input, Supabase just one backend. Links get lightweight, non-AI enrichment (titles, GitHub repo metadata) before persistence.

## Stack

- Swift 6.1
- Hummingbird 2
- Supabase
- Docker
- Cloudflare Tunnel
- Telegram Bot
