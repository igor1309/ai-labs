# Log

## 2026-05-02

- v0.1.4 cut for Access auth — release manifest updated alongside the version bump so the tagged deploy ships the no-shared-secret Worker behind Cloudflare Access.
- Cloudflare Access provisioned — `clipdeck.enoa.ai` is now fronted by a single-owner self-hosted Access application with deny-by-default policy; unauthenticated `/` and `/api/items` redirect to the Access login before reaching the Worker.
- Access deploy verification prepared — Clipdeck deploys now check for Cloudflare Access handling instead of a Worker-generated shared-secret `401`, with first-deploy operations documented.
- App-level auth removed — Clipdeck now relies on Cloudflare Access for user-facing authentication; the Worker and frontend no longer require or store a shared secret.
- Cloudflare Access migration defined — Clipdeck will replace the user-facing shared secret with Access while preserving Worker-only GitHub credentials.
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
