# notio — Change Log

## 2026-04-23

- Addressed all four review findings across specs: (1) added `checking` bootstrap state to `AuthState` so persisted sessions don't flash `unauthorized` — browse-view waits for auth to resolve before reacting; (2) unified Supabase SDK import rule into a single canonical list in auth-session spec §Supabase SDK import boundary (`main.ts`, `SupabaseBrowseItemsReader.ts`, `SupabaseAuthSession.ts`), all other specs defer to it; (3) fixed config validation to trim-before-validate so whitespace-only env vars are rejected, added test cases; (4) added `loadMoreError: string | null` field to `BrowseState.loaded` so load-more failures have a defined error channel while preserving items.

- Saved a review document for the new mvp_01 frontend specs at `docs/specs/reviews/notio-frontend-spec-review-2026-04-23.md`, capturing four concrete issues to resolve before implementation: persisted-session bootstrap vs unauthorized state, conflicting Supabase SDK import boundaries across specs, whitespace-only env validation drift, and missing load-more error-state shape in the browse view spec.

- Three new frontend specs completing the mvp_01 spec set: `auth-session-v0.0.1` (auth protocol — magic-link sign-in, sign-out, reactive state, session expiration mapping; notes ADR-001 enforcement extension for auth adapter SDK import), `browse-view-v0.0.1` (Svelte browse component — full state machine with transitions, Load more / refresh interactions, item rendering rules, ADR-003 exclusions), `supabase-config-v0.0.1` (config module — env var reading, validation, sole `import.meta.env` reader, no SDK import). Together with the existing `browse-items-reader` spec, the four specs cover the full mvp_01 frontend surface and are ready for implementation plan writing.

- First frontend spec draft: `docs/specs/browse-items-reader-v0.0.1.md` — the read protocol the `browse` feature uses to page through `captured_items`. Pins the TypeScript types (`CapturedItem`, `PageCursor`, `Page`, `PAGE_SIZE`, `UnauthorizedError`, `ReaderError`), the `BrowseItemsReader` interface (`fetchFirstPage`, `fetchAfter(cursor)`), keyset-cursor semantics, error mapping to the ADR-003 state set, and an enumerated test list covering page shape, cursor semantics, shape fidelity, errors, and query-shape assertions. Anchored in ADR-001/003/004/005/006; next specs are `browse-view`, `auth`, and `config`.

- Frontend ADR-006 (platform, hosting, and repo layout for `mvp_01` frontend): locks the stack as a static web SPA in TypeScript + Svelte + Vite, using `@supabase/supabase-js`, hosted on Cloudflare Pages (static only, no Pages Functions), living at `notio/frontend/` with a dedicated `.github/workflows/notio-frontend-core.yml` per Per-Project CI Isolation. Config injection is via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the `VITE_*` prefix is the structural boundary that keeps the service-role key out of the bundle. Closes the last architectural gap before spec writing.

- Merged frontend ADR-003 (product scope) from the `notio-research` branch and stitched the set together: ADR-003 pins sign-in method (magic link / OTP email), pagination (Load more, page size 50), state set (`loading|refreshing|loaded|empty|failed|unauthorized`), and product out-of-scope list, now with a `Related ADRs` header, a reference to ADR-004 instead of "the existing table as-is", and an Enforcement section (page size constant, no infinite-scroll, sign-in method lock, closed state machine, session-expiration → `unauthorized`). ADR-001 state list now defers to ADR-003; ADR-002 Non-Goal "exact sign-in method" is removed (decided in ADR-003). Indexes and cross-links updated across ADR-001/002/004/005 and the top-level notio README.

- Frontend ADR-005 (single-user data model for `mvp_01` frontend) and ADR-004 (read-model contract for `mvp_01` browse): lock the product as single-user/personal/discovery at the data-model level — no per-row ownership, no Telegram-to-Supabase identity bridge, Supabase Auth as a binary gate; pin `captured_items` columns as the public read surface with explicit-select rule and "non-public by default" for new columns. Back-linked from ADR-001/ADR-002; ADR-002's authorization rule now defers to ADR-005 instead of sitting open. (Originally authored as ADR-003 on this branch; renumbered to ADR-005 to make room for the product-scope ADR-003 from `notio-research`.)

- Frontend ADRs for `mvp_01` (read-only Supabase browse client): ADR-001 (architecture: direct thin client, no BFF, feature-owned read protocol, no mutating Supabase calls) and ADR-002 (auth: Supabase Auth + RLS scoped to the `authenticated` role, no anonymous or service-role access). Both ADRs include Enforcement sections with reviewable rules (MUST/MUST NOT) and cross-link to each other and to capture ADR-003. Added `docs/frontend/adr/README.md` to namespace the frontend ADR numbering; linked frontend ADRs from the top-level `README.md`.

## 2026-04-19

- Two-phase capture feedback (`notio_v0.3.0`): immediate receipt acknowledgement and final outcome (success/failure) messages sent to Telegram after each capture request. MessageSender/TelegramMessageSender transport, CaptureFeedbackMessenger formatting layer, NotifyingCaptureStore decorator for outcome feedback. CaptureService unchanged — feedback is wired at the boundary. Bot token required in normal mode, optional in diagnostic mode. 144 tests, Docker verified.

- Deployed `notio_v0.2.0`: full capture pipeline live on VPS. End-to-end verified — notes, private repo links (enrichment: failed/expected), and public repo links (enrichment: partial) all persisted to Supabase. Fixed deploy timeout (ssh `command_timeout` increased to 15m for VPS Docker build).

- Release prep for `notio_v0.2.0`: updated README status and env vars table, cleaned up future directions. 116 tests.

- Enrichment pipeline: link items are enriched with title/description before persistence. WebPageEnricher (HTML metadata extraction), GitHubRepoEnricher (API-based), CompositeEnricher (source-type routing), CaptureService (parse → enrich → save orchestration). Supabase schema migration for `captured_title`/`captured_description` columns.

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
