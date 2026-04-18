# Notio

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

If enrichment fails, the item is still persisted. Enrichment outcome is recorded as `full` | `partial` | `failed` | `none`.

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

Specs: [`docs/specs/`](docs/specs/). Plans: [`docs/plans/`](docs/plans/).

## Stack

Swift 6.1 + [Hummingbird 2](https://github.com/hummingbird-project/hummingbird). Single executable (`NotioServer`) built from the `NotioApp` library. Deployed as a Docker container behind Cloudflare Tunnel.

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
| `NOTIO_DIAGNOSTIC_MODE`        | no       | —       | `ack` \| `inspect` \| `delay` \| `fail`              |
| `NOTIO_DIAGNOSTIC_DELAY_MS`    | no       | `5000`  | Delay for `delay` mode; ignored otherwise            |
| `NOTIO_DIAGNOSTIC_FAIL_STATUS` | no       | `500`   | HTTP status for `fail` mode; ignored otherwise       |

## Local development

```bash
swift test              # unit tests
swift build             # debug build
swift run NotioServer   # run locally (NOTIO_WEBHOOK_PATH required)
```

Docker:

```bash
docker build -t notio:dev .
docker run --rm -p 8080:8080 -e NOTIO_WEBHOOK_PATH=test notio:dev
```

## Release

Notio is an independent release unit. Canonical version lives in `release.toml`; tags follow `notio_v<version>`. Flow: push to `trunk` → tag → CI builds, tests, and deploys to VPS. Full policy in repo-level `CLAUDE.md`.

## Status

v1 bring-up complete (`notio_v0.1.1`): service deployed on VPS, `@NotioInboxBot` webhook live at `inbox.enoa.ai`, structured JSON logging verified end-to-end. The webhook currently acks only — the capture core, enrichment, and Supabase-backed storage are the next slices. History: [`docs/log.md`](docs/log.md).

## Future directions

- capture core + Supabase-backed storage (next)
- additional source-specific enrichers
- tags and AI-assisted summarization
- query/read/edit clients
- multiple storage implementations in parallel
- reprocessing of previously captured items
