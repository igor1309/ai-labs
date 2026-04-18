---
date: 2026-04-18
model: claude-opus-4-6
description: "Implementation plan for Step 3: first real Swift/Hummingbird service slice"
status: implemented
type: plan
---

# Step 3 — First Real Service Slice

## Goal

Bootstrap the notio service as a Swift/Hummingbird application with health, version, and webhook ack endpoints, structured logging, and a Docker artifact.

## Authoritative sources

- `notio/docs/plans/initial-bring-up-steps-real-integration-path-v0.0.4.md` (step 3)
- `notio/docs/adr/adr-002-v1-deployment-topology.md`
- `notio/docs/adr/adr-004-runtime-diagnostics-config-driven-composition.md`
- `notio/docs/adr/adr-005-tag-driven-cicd-to-vps.md`
- `notio/docs/specs/telegram-webhook-adapter-behavior-v0.0.2.md`
- `notio/docs/tunnel.md`

## ADR Traceability Matrix

| Plan scope | Source | Governing requirement | Covered by |
|------------|--------|-----------------------|------------|
| Single deployable Swift/Hummingbird service for the first real slice | ADR-002 | v1 runs as a Swift/Hummingbird server app on a VPS, with logical separation preserved even if deployed as one process | Fixed decisions, Package layout, Steps 1 and 6 |
| Secret webhook path and real webhook ingress shape | ADR-002 | A secret webhook path MUST be used | Config shape, Endpoints, Step 4, Tests 1, 7, and 8 |
| Structured logging on the service surface | ADR-002 | Structured logging MUST be present | Logging, Step 5 |
| Diagnostic behavior selected by config, not enabled by default | ADR-004 | Diagnostic behavior MUST require explicit configuration and MUST NOT be enabled by default | Config shape, Diagnostic modes in scope, Tests 3 and 4 |
| No separate diagnostic surface for bring-up behavior | ADR-004 | The real service path remains the validation surface; a separate diagnostic service or endpoint is not used | Goal, Endpoints, Diagnostic modes in scope, Out of scope |
| Health and version endpoints exposed by the service | ADR-005 | The service MUST expose a health endpoint and a version endpoint for deployment verification | Endpoints, Steps 2 and 3, Tests 5 and 6 |
| Runtime version reported by the running service | ADR-005 | The version reported by the service MUST equal the deployed release version | Version injection, Endpoints, Step 2, Step 7 |
| Docker artifact for the service slice | ADR-005 | The deployable artifact is a Docker image carrying the release version into runtime verification | Dockerfile, Version injection, Step 7 |
| Secrets isolated from source code | ADR-002 | Secrets MUST be isolated from source code and deployment config | Config shape (webhook path read from `NOTIO_WEBHOOK_PATH` env, never hardcoded); full secrets story (bot token, storage creds) deferred to later steps |
| Fast webhook acknowledgment behavior | Telegram webhook spec | Accepted requests return success without waiting for downstream capture work; ack mode returns success immediately | Goal, Endpoints, Diagnostic modes in scope, Step 4, Tests 1, 2, and 3 |

## Fixed decisions

- Language: Swift
- Server framework: Hummingbird
- Runtime shape: one deployable service
- Listen port: 8080 (tunnel already configured)
- Executable target: `NotioServer`
- Library target: `NotioApp` (testable)

## Package layout

```
notio/
  Package.swift
  Sources/
    NotioServer/
      main.swift
    NotioApp/
      App.swift
      Routes/
        HealthRoute.swift
        VersionRoute.swift
        WebhookRoute.swift
      Config.swift
      StructuredLogger.swift
  Tests/
    NotioAppTests/
      HealthRouteTests.swift
      VersionRouteTests.swift
      WebhookRouteTests.swift
  Dockerfile
```

`NotioApp` is a library so tests can import it and test route behavior directly via Hummingbird test helpers without booting a real server. `NotioServer` is the thin executable entry point.

Use the `swift-package-manifest` skill when creating `Package.swift`.

## Config shape

```swift
struct Config {
    let port: Int                       // default 8080, from NOTIO_PORT env
    let version: String                 // from NOTIO_VERSION env, default "dev"
    let webhookPath: String             // from NOTIO_WEBHOOK_PATH env (the secret)
    let diagnosticMode: DiagnosticMode? // from NOTIO_DIAGNOSTIC_MODE env, nil = normal
}

enum DiagnosticMode {
    case ack
    case inspect
    case delay(seconds: Double)
    case fail(statusCode: Int)
}
```

Env-driven per ADR-004. `nil` mode = normal production behavior (fast ack, no diagnostic).

## Version injection

Build-time `ARG VERSION` in Dockerfile, passed as `NOTIO_VERSION` env var. At runtime, `Config` reads it. Default `"dev"` for local runs.

`docker build --build-arg VERSION=0.1.0 .` — ADR-005 verification (`GET /version` returns the tag) works directly.

## Logging

Swift's built-in `swift-log` (Hummingbird already depends on it). Custom `LogHandler` (~30 lines) that emits JSON lines with the slice-required fields: timestamp, mode, path, status, latency.

No additional logging dependency.

## Endpoints

| Method | Path | Response | Purpose |
|--------|------|----------|---------|
| GET | `/health` | 200 `{"status":"ok"}` | Liveness / CI verification |
| GET | `/version` | 200 `{"version":"<NOTIO_VERSION>"}` | CI deploy verification (ADR-005) |
| POST | `/<secret-webhook-path>` | 200 `ok` | Fast webhook ack |
| * | * | 404 | Unknown routes |

## Diagnostic modes in scope

**Included:** `ack` mode (fast-ack with minimal logging — this is what the bring-up slice needs).

**Deferred:** `inspect`, `delay`, `fail` modes. Not needed until Telegram webhook testing in steps 10–12. Follow-up step.

## Dockerfile

Multi-stage build:
1. `swift:6.1` — build stage
2. Ubuntu runtime — final image, minimal footprint

Expose 8080. `ARG VERSION` → `ENV NOTIO_VERSION`.

## Execution lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-step-3`
- Expected branch: `codex/notio-step-3`
- Preflight check: [x] done

## Steps

### Step 1 — Package.swift and empty targets

Create `Package.swift` (use `swift-package-manifest` skill), empty `NotioServer` and `NotioApp` targets. Verify `swift build` compiles.

- [x] `Package.swift` created
- [x] `swift build` passes
- [x] commit

### Step 2 — Config and version endpoint

Implement `Config` (env-driven) and `GET /version` route. Test that version endpoint returns the configured version.

- [x] `Config.swift` implemented
- [x] `VersionRoute.swift` implemented
- [x] `VersionRouteTests.swift` passes
- [x] commit

### Step 3 — Health endpoint

Implement `GET /health`. Test response.

- [x] `HealthRoute.swift` implemented
- [x] `HealthRouteTests.swift` passes
- [x] commit

### Step 4 — Webhook ack endpoint

Implement `POST /<secret-webhook-path>` with fast 200 `ok` ack. Test that:
- accepted requests return 200 immediately
- unknown POST paths return 404
- webhook path is config-driven

- [x] `WebhookRoute.swift` implemented
- [x] `WebhookRouteTests.swift` passes
- [x] commit

### Step 5 — Structured logging

Implement JSON `LogHandler`. Wire into `App`. Verify log output includes required fields on webhook requests.

- [x] `StructuredLogger.swift` implemented
- [x] logging verified in tests
- [x] commit

### Step 6 — App composition and entry point

Wire `App.swift` (composition root) and `main.swift`. Verify the server starts and responds on port 8080.

- [x] `App.swift` wires routes and config
- [x] `main.swift` boots the server
- [x] manual or integration test confirms startup
- [x] commit

### Step 7 — Dockerfile

Multi-stage Dockerfile. Verify `docker build --build-arg VERSION=0.1.0 .` succeeds and container responds on 8080.

- [x] Dockerfile created
- [x] docker build succeeds
- [x] container responds to health/version/webhook
- [x] commit

### Step 8 — Release unit registration

Add `"notio"` to `release-units.config.toml` paths. Regenerate `release-units.toml`. Add `notio` to root `package.json` test script glob (if applicable — Swift tests run via `swift test`, not npm).

- [x] release unit registered
- [x] manifest regenerated
- [x] commit

### Step 9 — Final gates and plan closeout

- [x] `swift build` passes
- [x] `swift test` passes (17/17)
- [x] docker build succeeds
- [x] plan moved to `notio/docs/plans/implemented/`
- [x] PR created: igor1309/ai-labs#134

## Tests

From the webhook spec (subset in scope for this slice):

1. Accepted requests return a successful HTTP response without waiting for downstream capture processing.
2. Adapter success is preserved when downstream capture processing is stubbed or disabled.
3. `ack` mode returns success immediately and performs no downstream capture work.
4. Diagnostic modes require explicit runtime configuration and are not enabled by default.
5. Health endpoint returns 200 with status ok.
6. Version endpoint returns the configured version string.
7. Unknown routes return 404.
8. Webhook path is config-driven (requests to wrong path get 404).

## Out of scope

- `inspect`, `delay`, `fail` diagnostic modes
- Downstream capture processing
- Telegram-specific payload parsing
- CI/CD workflow (step 4 in the bring-up plan)
- Cloudflare Tunnel config (already done)
