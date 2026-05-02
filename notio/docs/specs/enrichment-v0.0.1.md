---
title: Enrichment Pipeline
date: 2026-04-19
model: claude-opus-4-6
description: "Defines the enrichment contract: fetch title/description for captured links before persistence."
version: 0.0.1
status: draft
type: spec
---

# Enrichment Pipeline

## Goal

Enrich captured link items with page title and description before persistence, owned by the capture service.

## Public interface

### Enricher protocol

```swift
public protocol Enricher: Sendable {
    func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult
}

public struct EnrichmentResult: Equatable, Sendable {
    public let title: String?
    public let description: String?
    public let status: CapturedItem.Enrichment
}
```

### CapturedItem changes

Add two optional fields:

```swift
public let capturedTitle: String?
public let capturedDescription: String?
```

### Persistence contract

The storage layer must preserve `capturedTitle`, `capturedDescription`, and `enrichment` for each captured item. Schema details belong to the implementation plan, not this spec.

## Behavior rules

### When to enrich

- Only enrich items with `kind == .link` and a non-nil `url`.
- Link items always have a concrete `sourceType` — the enricher receives it non-optional.
- Note-only items skip enrichment; `enrichment` stays `.none`.

### Enrichment flow

1. Parse message → `IngressResult`
2. Build `CapturedItem` (enrichment = `.none`)
3. If link: call `enricher.enrich(url:sourceType:)` with the item's concrete source type
4. Apply result: set `capturedTitle`, `capturedDescription`, update `enrichment` status
5. Save enriched item to store

### Web page enrichment

- Fetch the URL with a GET request (timeout: 5 seconds, max body: 512 KB).
- Extract `<title>` text content.
- Extract `<meta name="description" content="...">` value.
- If both found: `enrichment = .full`.
- If only one found: `enrichment = .partial`.
- If neither found (but fetch succeeded): `enrichment = .partial` with nil fields.
- If fetch fails (timeout, non-2xx, parse error): `enrichment = .failed`.

### GitHub repo enrichment

- For `sourceType == .githubRepo`, use the GitHub API: `GET https://api.github.com/repos/{owner}/{repo}`.
- Extract `full_name` as title, `description` as description.
- No auth token required for public repos (rate limit: 60/hr).
- If API returns non-2xx or decode fails: `enrichment = .failed`.
- v1 scope is title and description only. README excerpt and source-specific nested fields are deferred to a future spec revision.

### Failure handling

- Enrichment failure MUST NOT prevent persistence.
- On failure: set `enrichment = .failed`, leave title/description nil, save the item.
- Log the failure at error level with the URL and error.

### Timeout and size limits

- HTTP timeout: 5 seconds per request.
- Max response body: 512 KB (sufficient for HTML `<head>` and API responses).
- Timeout produces `enrichment = .failed`.
- Oversized response is truncated to 512 KB; extraction proceeds on available data.

## Tests (required)

1. Note-only item skips enrichment; `enrichment` stays `.none`, title/description nil.
2. Link item with successful web enrichment sets `enrichment = .full`, title, and description.
3. Link item with partial web enrichment (title only) sets `enrichment = .partial`.
4. Link item with failed fetch sets `enrichment = .failed`, title/description nil.
5. GitHub repo link uses GitHub API enrichment; sets title to `full_name`, description to repo description.
6. GitHub API failure falls back to `enrichment = .failed`.
7. Enrichment failure does not prevent save — item is persisted with `.failed` status.
8. Web enricher extracts `<title>` correctly from HTML.
9. Web enricher extracts `<meta name="description">` correctly from HTML.
10. CapturedItem with enrichment result maps title/description and status correctly.
11. Link items invoke enrichment with a concrete (non-optional) source type.
12. Request exceeding 5-second timeout produces `enrichment = .failed`.
13. Oversized response (>512 KB) does not crash; extraction proceeds on truncated data.

## Done criteria

- Enricher protocol and at least one implementation (web page) exist.
- CapturedItem carries `capturedTitle` and `capturedDescription`.
- Enrichment runs in the background capture path before save.
- All required tests pass.
- Storage layer persists the new enrichment fields.
