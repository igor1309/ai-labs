# notio

Personal capture system: turn inbound messages into retained items. v1 ingress is a Telegram bot (`@NotioInboxBot`) delivered via webhook to a Swift service behind Cloudflare Tunnel at `inbox.enoa.ai`.

## Stack

Swift 6.1 + [Hummingbird 2](https://github.com/hummingbird-project/hummingbird). Single executable (`NotioServer`) built from the `NotioApp` library. Deployed to a VPS as a Docker container; Cloudflare Tunnel terminates public HTTPS.

## Architecture

The system is split into four parts: ingress adapter, capture service, storage interface, and storage implementation. See `docs/adr/` for the authoritative design:

- `adr-001` — capture system boundaries
- `adr-002` — v1 deployment topology
- `adr-003` — Supabase-backed storage
- `adr-004` — runtime diagnostics via config-driven composition
- `adr-005` — tag-driven CI/CD to VPS

Specs live under `docs/specs/`; plans under `docs/plans/`.

## Endpoints

| Path                        | Method | Description                                        |
|-----------------------------|--------|----------------------------------------------------|
| `/health`                   | GET    | Liveness probe (`{"status":"ok"}`)                 |
| `/version`                  | GET    | Deployed version (`{"version":"..."}`)             |
| `/<NOTIO_WEBHOOK_PATH>`     | POST   | Telegram webhook receiver; acks per diagnostic mode |

## Environment variables

| Variable                       | Required | Default | Description                                             |
|--------------------------------|----------|---------|---------------------------------------------------------|
| `NOTIO_WEBHOOK_PATH`           | yes      | —       | Secret webhook path segment                             |
| `NOTIO_PORT`                   | no       | `8080`  | HTTP listen port                                        |
| `NOTIO_VERSION`                | no       | `dev`   | Reported by `/version`                                  |
| `NOTIO_DIAGNOSTIC_MODE`        | no       | —       | `ack` \| `inspect` \| `delay` \| `fail`                 |
| `NOTIO_DIAGNOSTIC_DELAY_MS`    | no       | `5000`  | Delay for `delay` mode                                  |
| `NOTIO_DIAGNOSTIC_FAIL_STATUS` | no       | `500`   | HTTP status for `fail` mode                             |

## Local development

```bash
swift test              # run unit tests
swift build             # build debug
swift run NotioServer   # run locally (requires NOTIO_WEBHOOK_PATH set)
```

Docker:

```bash
docker build -t notio:dev .
docker run --rm -p 8080:8080 -e NOTIO_WEBHOOK_PATH=test notio:dev
```

## Release

Notio is an independent release unit. Version is canonical in `release.toml`; tags follow `notio_v<version>`. Release workflow: push to `trunk` → tag → CI builds, tests, deploys to VPS. See the repo-level `CLAUDE.md` for the full policy.

## Status

v1 bring-up complete: service deployed, Telegram webhook wired end-to-end, structured JSON logging verified. Capture service and Supabase-backed storage are the next slices.
