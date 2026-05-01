---
date: 2026-05-01
model: claude-opus-4-7
description: "Index and reading order for clipdeck docs"
---

# clipdeck — Docs

clipdeck is an iPhone-friendly private webpage that copies prompts and skills from `igor1309/ai-labs` with one tap. The backend strips YAML front matter server-side; the client never sees raw GitHub responses.

## Reading order

1. [`adr/adr-001-iphone-copy-library.md`](adr/adr-001-iphone-copy-library.md) — architecture (two-tier, sole runtime GitHub principal, sanitization, item model)
2. [`adr/adr-002-credential-lifecycle.md`](adr/adr-002-credential-lifecycle.md) — runtime GitHub PAT lifecycle
3. [`adr/adr-003-deployment-topology.md`](adr/adr-003-deployment-topology.md) — single Cloudflare Worker with Static Assets, single origin
4. [`adr/adr-004-ci-cd-workflows.md`](adr/adr-004-ci-cd-workflows.md) — PR gate + tag-driven deploy
5. [`specs/spec-iphone-copy-library.md`](specs/spec-iphone-copy-library.md) — API contract and the tests an implementation MUST pass
6. [`plans/clipdeck-mvp.md`](plans/clipdeck-mvp.md) — phased implementation plan

## Conventions

- ADRs settle architecture. The spec is the contract; its tests are the failure surface. The plan picks implementation libraries and layout.
- [`reviews/`](reviews/) holds external doc reviews. [`log.md`](log.md) records outcomes only.
