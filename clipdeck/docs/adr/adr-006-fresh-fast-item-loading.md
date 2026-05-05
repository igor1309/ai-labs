---
title: "ADR-006: Fresh-Fast Item Loading"
date: 2026-05-05
model: claude-opus-4-7
description: "Replace per-request fan-out to the GitHub REST contents API with a single GraphQL bulk fetch, gated by a SHA-keyed Cache API entry with a short freshness window"
status: accepted
artifact_type: adr
---

# ADR-006: Fresh-Fast Item Loading

## Executive Summary

Clipdeck's `GET /api/items` will fetch all prompt and skill bodies in a single GitHub GraphQL request, and the assembled response will be cached in the Workers Cache API keyed by the trunk commit SHA. Cache freshness is bounded by a short TTL window. This replaces the current fan-out of one GitHub REST call per file plus a serial `await` loop, while preserving the item shape, source allowlisting, and Worker-only credential boundary established by ADR-001 and ADR-005. No new infrastructure (KV, R2, Durable Objects, cron triggers) is introduced.

## Context

Today `handleItems` issues one `listDir` plus N `readFile` calls for prompts and one `listRecursiveTree` plus M serial `readFile` calls for skill `SKILL.md` files. With current content size that is 43 GitHub REST calls per request, of which 37 are serialized inside `buildSkillFolders`. Empirically this takes long enough to be perceptible on every page load.

Constraints relevant to a fix:

- Rendered results MUST be fresh; the operator accepts a freshness lag of at most about 10 seconds after a push to trunk.
- Clipdeck MUST stay on Cloudflare's free tier; no Workers KV writes on the request path, no cron triggers, no Durable Objects.
- The browser MUST NOT receive the GitHub PAT, raw GitHub responses, or out-of-allowlist content (ADR-001, ADR-005).
- Workers free-tier limits include 50 subrequests per request and 10 ms CPU per request.
- The GitHub primary REST rate limit is 5000 requests per hour for authenticated calls; GraphQL has its own per-hour point budget at the same scale.
- The source paths under control of this ADR remain `prompts/` and `dev-skills/public/` on `trunk`, per ADR-001.

Rejected alternatives:

- Bundle prompts and skills into the Worker assets at deploy time: removes runtime GitHub calls but introduces a deploy lag for every content edit, which violates the operator's freshness requirement.
- Periodic cron sync into Workers KV: removes per-request GitHub calls but requires the paid plan for scheduled triggers and a staleness window driven by sync cadence, which the operator rejected.
- Lazy cache with TTL only and no SHA validation: simpler, but cannot guarantee that a request after a push reflects post-push content within the freshness window without an upstream check.
- Parallelize the existing REST fan-out without changing the call shape: removes the serial bottleneck but leaves the per-request fan-out at roughly 43 subrequests, close to the free-tier subrequest ceiling and still load-bearing on every cache miss.

## Decision

`GET /api/items` MUST source prompt and skill content from a single GitHub GraphQL request that returns the bodies of all allowlisted files, and MUST cache the assembled response in the Workers Cache API keyed by the trunk commit SHA with a freshness TTL of at most 10 seconds.

Cache hits MUST serve the previously assembled body without contacting GitHub. Cache misses MUST consult GitHub for the current trunk SHA, and MUST rebuild via the GraphQL request only when the trunk SHA has changed since the last cached body. The browser-visible response shape, status codes, headers, and error contract defined by ADR-001 and the existing item spec MUST NOT change.

This ADR governs only the loading mechanism for `/api/items`. It does not modify access control, source allowlisting, or item normalization rules.

## Rules / Invariants

### Loading mechanism

- The Worker MUST issue at most one GitHub GraphQL request per `/api/items` rebuild covering both prompt files and skill `SKILL.md` files in scope.
- The Worker MUST NOT issue per-file REST `readFile` calls on the request path for prompt or skill content once this ADR is in force.
- The GraphQL request MUST request only the allowlisted source paths defined by ADR-001 and MUST NOT broaden the source allowlist.
- Binary blobs returned by GraphQL (`isBinary == true`) MUST be ignored.

### Freshness and caching

- The Worker MUST cache the assembled `/api/items` response body in the Workers Cache API.
- The cache key MUST include the trunk commit SHA the body was built from.
- The cache entry MUST carry a freshness TTL of at most 10 seconds.
- A cache miss or expiry MUST trigger a freshness check against GitHub for the current trunk SHA.
- If the freshness check shows the same SHA the cached body was built from, the Worker MUST refresh the cache entry with that body and the same SHA key.
- If the freshness check shows a different SHA, the Worker MUST rebuild via the GraphQL request before serving the new body.
- The Worker MUST NOT serve a body whose SHA differs from the trunk SHA most recently observed by a freshness check.

### Subrequest and CPU budget

- A `/api/items` request served by a Cache API hit within the freshness window MUST issue zero GitHub subrequests.
- A `/api/items` request whose freshness check confirms an unchanged SHA MUST issue at most one GitHub subrequest.
- A `/api/items` request that requires a rebuild MUST issue at most two GitHub subrequests: one freshness check and one GraphQL fetch.
- The Worker MUST stay within Cloudflare's free-tier subrequest and CPU envelopes for `/api/items`.

### Failure handling

- A failure to reach GitHub during a freshness check or a rebuild MUST surface as the existing upstream-failure error contract.
- The Worker MUST NOT serve a body it has not validated against the current trunk SHA, except when a Cache API hit returns within the freshness window.
- Errors raised by the loading mechanism MUST use the existing `502` response shape; no new error codes are introduced by this ADR.

### Response shape and access boundary

- The `/api/items` response body, status codes, headers, and ETag semantics MUST remain as defined by ADR-001 and the existing spec.
- The browser MUST NOT receive the GitHub PAT, raw GraphQL responses, YAML front matter, or content outside the ADR-001 allowlist.
- The Cloudflare Access boundary defined by ADR-005 MUST remain the only user-facing authentication layer; this ADR does not introduce or remove any access check.

### Verification

- Automated tests MUST cover: cache hit serves without GitHub calls, cache miss with unchanged SHA refreshes without rebuild, cache miss with changed SHA rebuilds via GraphQL, GraphQL upstream failure surfaces the existing error contract, and the response body shape is unchanged.
- Static analysis MUST keep the existing typecheck gate green.

## Consequences

Operational impact:

- Page-load latency is dominated by Cache API latency for requests inside the freshness window and by a single GraphQL round-trip otherwise.
- The GitHub call budget per `/api/items` request drops by at least an order of magnitude in steady state.
- Operator freshness expectations are bounded explicitly: any content change on `trunk` is visible within the freshness TTL plus one round-trip.

Tradeoffs accepted:

- A request that lands within the freshness window after a push MAY return content from the prior SHA for up to the TTL.
- Clipdeck now has a runtime dependency on the GitHub GraphQL API in addition to the existing REST contents/tree endpoints; the GraphQL endpoint becomes a separate availability surface.
- A larger combined response body in GraphQL increases per-rebuild memory pressure relative to many small REST responses; this is bounded by current source size.
- Cache API entries are colo-local and not globally shared; cold colos pay one rebuild cost on first access.

Future extension points:

- Tightening the freshness TTL toward zero, by relying solely on per-request SHA checks, remains possible without changing the cache key or response shape.
- Splitting prompt and skill loading across separate cache entries, if either source grows large enough to dominate rebuild cost, can be introduced without amending this ADR.
- Replacing the Cache API with a different colo-local cache surface available to Workers does not require amending this ADR as long as the SHA-keyed invariant is preserved.

## Non-Goals

- no introduction of Workers KV, R2, Durable Objects, or scheduled triggers
- no change to the `/api/items` response shape, status codes, or ETag semantics
- no change to source allowlisting or YAML front-matter stripping defined by ADR-001
- no change to the Cloudflare Access user-facing authentication boundary defined by ADR-005
- no change to the GitHub PAT lifecycle defined by ADR-002
- no change to the deploy or release pipeline defined by ADR-004
- no smoke-test or production probe for the new loading mechanism beyond existing CI
- no per-user, per-session, or per-device caching behavior
- no cache invalidation API or admin-triggered refresh path
