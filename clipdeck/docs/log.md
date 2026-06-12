# Log

## 2026-06-12

- Library filter input font size raised from 0.9rem to 1rem so iOS Safari no longer auto-zooms the page when the search field gains focus (Safari zooms any focused text field with a computed font size below 16px).

## 2026-06-06

- Products page card now links directly to the deployed Clipdeck app (`clipdeck.enoa.ai`), with a regression test covering the static card markup.

## 2026-05-10

- v0.1.15 releases the skeleton loading spacing fix: loading placeholders now span the sections grid and keep the same card gap as real ClipDeck items.
- Skeleton loading spacing corrected — the placeholder wrapper now spans the sections grid and applies card spacing, preventing the three loading cards from rendering as a cramped vertical stack.
- v0.1.14 releases the frontend refresh: skeleton card loading for initial/reload fetches, sticky in-memory library filtering across title/subtitle/description, restored local preview mock data, and implemented spec/plan archival for the shipped work.
- Sticky library filtering landed in the frontend: a debounced sticky input now filters title, subtitle, and description without persisting state or mutating copyable item bodies.
- Local preview mock now matches the Cloudflare Access frontend: `/api/items` returns canned data without a bearer token, so `npm run preview --workspace clipdeck` renders the populated library again.
- MVP spec closeout corrected — the implemented iPhone copy-library spec moved under `clipdeck/docs/specs/implemented/`, matching the already-archived MVP plan and shipped Clipdeck behavior.
- Skeleton loading state shipped for the library: shimmer card placeholders replace the legacy `Loading…` text on initial load and reload, stay hidden from assistive tech, respect reduced motion, and clear on success or error.

## 2026-05-07

- Cloudflare Access application session duration raised to 1 week (set on the Clipdeck self-hosted app and on each attached policy in the Zero Trust dashboard) to reduce iPhone Email-OTP re-auth friction. No code change; ADR-005 still governs the access boundary. Longer-term auth alternatives are tracked separately for evaluation.

## 2026-05-05

- `/api/items` rebuilt around a single GitHub GraphQL request plus a SHA-keyed Workers Cache API entry. Steady-state requests within a 10-second freshness window serve the cached body with zero GitHub calls; expired pointers do a tiny SHA-only freshness query and either refresh the pointer (same SHA) or rebuild via the bulk GraphQL fetch (changed SHA). Replaces the prior 43-call REST fan-out (1 listDir + N readFile + 1 listRecursiveTree + M serial readFile) with at most 2 GitHub subrequests per request. Governed by ADR-006.
- App version moved from the page footer to the toolbar, rendered next to the `clipdeck` wordmark with the existing footer styling (subtle color, 0.7rem). Released as v0.1.12 — bundles the v0.1.11 prompt title/subtitle flip that never deployed because no `clipdeck_v0.1.11` tag was created.
- Prompt cards now mirror the skill card layout — the prompt's display name (front matter `name`, falling back to `title`) is rendered as the title and the filename slug becomes the subtitle, instead of the previous flipped layout that surfaced the slug as the title and the display name as the subtitle. Prompts without a `name`/`title` still fall back to the filename slug as title with no subtitle. Existing description and version derivation are unchanged. Released as v0.1.11.

## 2026-05-02

- Plain-text prompts supported — `prompts/*.txt` are now valid items, and prompts without front matter `description`/`summary` derive their description from a body-content prefix; titles fall back to the filename stem regardless of extension. Released as v0.1.10.
- Card layout reorganized — every item now exposes `title` (SKILL.md H1, prompt front matter `title`, or filename), `subtitle` (front matter `name`), and a separate `description` field (truncated front matter `description`/`summary`). The `(name)` parenthetical was dropped from skill titles since the name is now the dedicated subtitle, and prompts gained the same `subtitle`/`version` exposure as skills. Frontend renders the three lines stacked, hides the subtitle when it duplicates the title, and moves the copy toast from the bottom to the top of the viewport. Real-fixture test now also asserts subtitle equals each skill's front matter `name` and that no skill title leaks the parenthetical. Released as v0.1.9.
- Skill cards rendered as "error: no skill name" in production because gray-matter's YAML parse path requires `Buffer`, which Cloudflare Workers don't expose without `nodejs_compat`. The frontmatter parser swallowed the `ReferenceError` and returned the raw body with no metadata, so every card surfaced the missing-name error instead of the parse failure. Fixed by enabling `compatibility_flags = ["nodejs_compat"]` in `wrangler.toml`, making the parser's catch loud (`console.error` instead of silent fallback), and adding a real-fixture vitest that loads every `dev-skills/public/*/SKILL.md` and asserts `discoverSkills` produces non-error titles, non-empty subtitles, and front-matter-stripped bodies. The previous tests only used hand-rolled fixtures, so this class of bug was invisible until production. Released as v0.1.8.
- App version footer added — Clipdeck now exposes `GET /api/version` and renders the deployed package version (`v0.1.7`) at the bottom of the library page, mirroring notio's footer pattern. The constant is sourced from `clipdeck/package.json` via a JSON import so the footer cannot drift from the shipped release. Also added a frontend regression test that asserts the rendered subtitle text matches `item.subtitle` (previously only the count of items was asserted), so a future regression in the description-fetch path would fail in CI.
- Item metadata revalidation added — `/api/items` now sends a SHA-256 ETag for the normalized payload and returns `304 Not Modified` for matching validators, preserving fresh skill titles, versions, and subtitles without disabling browser caching.
- Skill card titles now combine the SKILL.md H1 with the front matter `name` as `<H1> (<name>)`, fall back to `name` when no H1 is present, and surface an explicit `error: no skill name` when the front matter `name` is missing so broken skills are visible.
- Access auth migration closed out — spec and plan moved to `implemented/`; production runs on Cloudflare Access with the v0.1.4 Worker. The inert `SHARED_SECRET` Worker secret is intentionally retained as a documented rollback window per the runbook and will be removed in a follow-up housekeeping change.
- v0.1.4 cut for Access auth — release manifest updated alongside the version bump so the tagged deploy ships the no-shared-secret Worker behind Cloudflare Access.
- Cloudflare Access provisioned — `clipdeck.enoa.ai` is now fronted by a single-owner self-hosted Access application with deny-by-default policy; unauthenticated `/` and `/api/items` redirect to the Access login before reaching the Worker.
- Access deploy verification prepared — Clipdeck deploys now check for Cloudflare Access handling instead of a Worker-generated shared-secret `401`, with first-deploy operations documented.
- App-level auth removed — Clipdeck now relies on Cloudflare Access for user-facing authentication; the Worker and frontend no longer require or store a shared secret.
- Cloudflare Access migration defined — Clipdeck will replace the user-facing shared secret with Access while preserving Worker-only GitHub credentials.
- Skill cards expose YAML metadata — the items API surfaces a `version` field for skills and truncates long descriptions to a reasonably long prefix, with the frontend rendering a version badge alongside the title.
- Frontend iteration no longer requires deploying — the populated library state is now reachable locally, so visual changes can be verified before they reach production.
- Frontend redesign — Clipdeck adopts the dark notio-aligned palette with an animated unlock card, hover/focus-visible item states, a floating auto-clearing toast, an explicit loading state, non-auth error surfacing, and a pull-to-refresh-only mode that hides the reload button on touch devices.
- Skills loading restored — Clipdeck now uses the GitHub recursive tree API for skill discovery, keeping production GitHub subrequests under the Worker runtime limit for v0.1.2.
- GitHub upstream access restored — Clipdeck now sends a required `User-Agent` on GitHub Contents API reads and releases the fix as v0.1.1.
- Production URL bound — `clipdeck/wrangler.toml` declares `clipdeck.enoa.ai` as a custom-domain route, and `CLIPDECK_PRODUCTION_URL` is set so the deploy workflow can verify the locked endpoint.
- Review fixes landed — GitHub content decoding now preserves UTF-8 Markdown, resource-backed skill detection counts sibling directories, and item sorting uses deterministic path order.

## 2026-05-01

- Phase 4 release wiring prepared — clipdeck is now a release unit with per-project CI, reusable Cloudflare deploy workflow, release-unit fan-in, manifest registration, README component update, and first-deploy runbook.
- Phase 3 frontend complete — static assets now serve through the Worker, with an iPhone-first unlock flow, bearer-token item fetch, rendered prompt/skill sections, copy feedback, reload replacement, and resource-backed skill styling covered in jsdom tests.
- Phase 2 API endpoint complete — `GET /api/items` now enforces bearer-secret auth, reads allowlisted GitHub Contents API paths, returns sanitized prompt/skill sections, and normalizes source-missing/upstream failures to the spec JSON errors.
- Phase 1 units complete — front matter parsing now preserves copyable Markdown bytes while tolerating malformed YAML, and pure discovery/assembly cover prompt and skill item shape, fallback titles/subtitles, section order, empty sections, and sorting.
- Phase 0 scaffold complete — clipdeck is now a private TypeScript Cloudflare Worker workspace with Wrangler, Vitest Workers-pool tests, strict typecheck, and a placeholder Worker response wired into the root test gate.
- clipdeck established as a docs-only top-level unit — an iPhone-friendly private webpage that copies prompts and skills with server-side front matter stripping. ADRs 001–004, spec, and MVP implementation plan written; ready to start coding.
