# notio — Change Log

## 2026-04-18

- Released `notio_v0.1.0`: first tag-driven release through the full CI/CD pipeline. Tests pass on Linux (swift:6.1 container), Docker image built and deployed on VPS, version verified, GitHub release created. Fixed deploy: SwiftPM 6.1 requires `Tests/` in the build context for source discovery even when building a single product; added `Tests/` to SCP source list and deploy script (Steps 6–7 complete).

- Configured Cloudflare Tunnel (`inbox`) from `inbox.enoa.ai` to `localhost:8080` on VPS 107.172.143.196; `cloudflared.service` enabled and running, returns 502 until the service is deployed (Step 5 complete).

- Wired notio tag-driven CI/CD on the release-unit path: added `test-notio` and `deploy-notio` jobs, VPS-local Docker build/tag (`<version>` + `<git-sha>`), host-level version verification, and notio deploy assets (`docker-compose.yml`, `.env.example`, `scripts/deploy.sh`) to make Step 4 release/deploy verification operational.

- Implemented Step 3 first service slice: Swift/Hummingbird service with health, version, and webhook ack endpoints, structured JSON logging, env-driven config, Dockerfile, and release unit registration. `swift build`, `swift test` (17 tests), `docker build`, and container health/version/webhook checks pass locally.

- Locked the first real service slice to Swift + Hummingbird in ADR-002 and the bring-up plan so Step 3 no longer leaves room for stack drift.
- ADR-001…005 are now internally consistent and aligned with the ADR structure template and review standard; ADR-003 is the single source of truth for the v1 storage backend.
- Spec files live under `docs/specs/`; pre-ADR Supabase note is archived.
