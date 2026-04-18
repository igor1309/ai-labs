---
title: Capture Message and Canonical Item Schema
date: 2026-04-17
model: gpt-5.4
description: "Defines the capture service-owned ingress normalization and canonical item contract for notio."
version: 0.0.1
status: draft
type: spec
---

# Capture Message and Canonical Item Schema

## Goal
Define the capture service-owned ingress message normalization and canonical captured item contract for v1 capture flows, excluding storage representation, markdown layout, GitHub file layout, and database schema.

## Public interface

### Ingress message shape

```yaml
message:
  text: string
  platform: telegram
  entities: optional
```

### Normalized ingress result

```yaml
ingress_result:
  primary_url: optional string
  note: optional string
```

### Canonical captured item shape

```yaml
item:
  kind: note | link
  source_type: optional string
  captured_at: "2026-04-17T18:00:00Z"
  url: optional string
  note: optional string
  captured_title: optional string
  captured_description: optional string
  enrichment: full | partial | failed | none
  source:
    github: optional
    web: optional
```

## Behavior rules

### Supported inputs
An ingress message may be one of:
- note only
- link only
- link with note

### Parsing rules
- If one or more URLs are present, the first URL is the primary source.
- Any remaining text becomes note text after normalization.
- Any additional URLs after the first remain part of the note.
- Telegram entities may be used minimally to preserve the intended link/text relationship.
- No explicit capture commands are required in v1.

### Input and normalization examples

#### Note only
```yaml
message:
  text: "check tradeoffs of actor-isolated stores later"
```

Normalizes to:

```yaml
ingress_result:
  primary_url: null
  note: "check tradeoffs of actor-isolated stores later"
```

#### Link only
```yaml
message:
  text: "https://github.com/pointfreeco/swift-composable-architecture"
```

Normalizes to:

```yaml
ingress_result:
  primary_url: "https://github.com/pointfreeco/swift-composable-architecture"
  note: null
```

#### Link with note
```yaml
message:
  text: "https://github.com/apple/swift-openapi-generator check whether generation boundaries are worth borrowing"
```

Normalizes to:

```yaml
ingress_result:
  primary_url: "https://github.com/apple/swift-openapi-generator"
  note: "check whether generation boundaries are worth borrowing"
```

#### Link with additional links in note
```yaml
message:
  text: "https://example.com/main compare with https://example.com/alt and maybe https://github.com/org/repo later"
```

Normalizes to:

```yaml
ingress_result:
  primary_url: "https://example.com/main"
  note: "compare with https://example.com/alt and maybe https://github.com/org/repo later"
```

### URL normalization
- store canonical URL only
- strip obvious tracking/query junk such as `utm_*`
- preserve semantically meaningful URL parts

### Note normalization
- store normalized note only
- raw transport message is not part of the canonical item
- if the message contains only a URL and no remaining text, note is absent
- if the message contains no URL, the entire normalized content becomes note

### Source classification
For v1:
- `kind: note` when no primary URL exists
- `kind: link` when a primary URL exists

For link items, `source_type` is determined from the primary URL.
Initial values:
- `github_repo`
- `web_page`

New `source_type` values MUST be added to this list before use in implementation.

GitHub non-root links are accepted but treated as generic web links unless explicitly handled later.

### Principles
The canonical captured item is:
- storage-independent
- self-sufficient for persistence
- independent of markdown/file layout
- independent of storage identity

### Common top-level fields
- `kind`
- `source_type`
- `captured_at` in UTC
- `url` if present
- `note` if present
- `captured_title` if available
- `captured_description` if available
- `enrichment`

### Source-specific nested fields
Only source-specific captured data belongs here.

Example:

```yaml
item:
  kind: link
  source_type: github_repo
  captured_at: "2026-04-17T18:00:00Z"
  url: "https://github.com/pointfreeco/swift-composable-architecture"
  note: "look at dependency boundaries and testing stance"
  captured_title: "pointfreeco/swift-composable-architecture"
  captured_description: "A library for building applications in a consistent and understandable way"
  enrichment: full
  source:
    github:
      owner: pointfreeco
      repo: swift-composable-architecture
      readme_excerpt: "..."
```

Another example:

```yaml
item:
  kind: link
  source_type: web_page
  captured_at: "2026-04-17T18:00:00Z"
  url: "https://example.com/article"
  note: "read later"
  captured_title: "Example article"
  captured_description: "Short page description"
  enrichment: partial
  source:
    web:
      page_title: "Example article"
      meta_description: "Short page description"
```

Note-only example:

```yaml
item:
  kind: note
  source_type: null
  captured_at: "2026-04-17T18:00:00Z"
  url: null
  note: "check whether inbox items need later tagging semantics"
  captured_title: null
  captured_description: null
  enrichment: none
  source: {}
```

### GitHub repository root
Try to capture:
- repository title/name
- repository description
- simple README excerpt

### Generic web page
Try to capture:
- page title
- short description if trivially available

### Failure handling
- persistence must still proceed when enrichment fails
- enrichment status must be explicit

### Storage boundary
The canonical item is what the capture service submits to storage.

The storage interface does not require read-back for the capture flow.
It only needs to report success or failure of persistence.
Storage representation details are out of scope for this spec.

## Tests (required)
1. Note-only message produces `primary_url: null` and `note` equal to the full normalized text.
2. Link-only message produces `primary_url` equal to the URL and `note: null`.
3. Link-with-note message assigns the first URL to `primary_url` and the remaining text to `note`.
4. Message with multiple URLs assigns the first URL to `primary_url` and leaves remaining URLs inline inside `note`.
5. URL normalization strips `utm_*` parameters from `primary_url`.
6. URL normalization preserves semantically meaningful query parameters in `primary_url`.
7. `kind` is `note` when no primary URL exists and `link` when a primary URL exists.
8. `source_type` is `github_repo` for a GitHub repository root URL and `web_page` otherwise.
9. Enrichment failure records `enrichment: failed` and still submits the item to storage.
10. Note-only items record `enrichment: none`, `source_type: null`, and `source: {}`.

## Done criteria
- Ingress message parsing implements the normalization rules in this spec.
- Canonical captured item output matches the public interface and behavior rules in this spec.
- All required test cases in this spec pass.
