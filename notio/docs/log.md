# notio — Change Log

## 2026-04-19

- Webhook route refactored: extracted helpers (readBody, baseMetadata, decodeUpdate, appendUpdateMetadata, appendInspectMetadata, respond, captureInBackground), injected `now` clock dependency, removed nil default from store parameter, fixed NIOFoundationCompat `Data(buffer:)` → `Data(ByteBufferView())` in SupabaseCaptureStore. 60 tests, local Docker build verified.

- Capture pipeline steps 1–4: TelegramUpdate model with typed decoding, IngressParser (URL extraction, UTM stripping, entity/regex fallback), CapturedItem canonical model with source classification, CaptureStore protocol + SupabaseCaptureStore adapter. Supabase project `notio` created with `captured_items` table. 59 tests.

- Implemented diagnostic modes (inspect, delay, fail) per ADR-004 and webhook adapter spec. Inspect logs bounded payload subset (update_id, chat_id, truncated text); delay sleeps configurable ms; fail returns configurable HTTP status. 31 tests, local Docker build verified.

## 2026-04-18

- Completed full bring-up path (all 12 steps): VPS health/version verified (Step 8), public reachability via `inbox.enoa.ai` confirmed (Step 9), Telegram bot `@NotioInboxBot` webhook configured (Steps 10–11), end-to-end delivery verified with structured JSON logging after `notio_v0.1.1` fix (Step 12).

- Released `notio_v0.1.0`: first tag-driven release through the full CI/CD pipeline. Tests pass on Linux (swift:6.1 container), Docker image built and deployed on VPS, version verified, GitHub release created. Fixed deploy: SwiftPM 6.1 requires `Tests/` in the build context for source discovery even when building a single product; added `Tests/` to SCP source list and deploy script (Steps 6–7 complete).

- Configured Cloudflare Tunnel (`inbox`) from `inbox.enoa.ai` to `localhost:8080` on VPS 107.172.143.196; `cloudflared.service` enabled and running, returns 502 until the service is deployed (Step 5 complete).

- Wired notio tag-driven CI/CD on the release-unit path: added `test-notio` and `deploy-notio` jobs, VPS-local Docker build/tag (`<version>` + `<git-sha>`), host-level version verification, and notio deploy assets (`docker-compose.yml`, `.env.example`, `scripts/deploy.sh`) to make Step 4 release/deploy verification operational.

- Implemented Step 3 first service slice: Swift/Hummingbird service with health, version, and webhook ack endpoints, structured JSON logging, env-driven config, Dockerfile, and release unit registration. `swift build`, `swift test` (17 tests), `docker build`, and container health/version/webhook checks pass locally.

- Locked the first real service slice to Swift + Hummingbird in ADR-002 and the bring-up plan so Step 3 no longer leaves room for stack drift.
- ADR-001…005 are now internally consistent and aligned with the ADR structure template and review standard; ADR-003 is the single source of truth for the v1 storage backend.
- Spec files live under `docs/specs/`; pre-ADR Supabase note is archived.
