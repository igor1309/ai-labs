---
title: Capture Message and Canonical Item Schema
date: 2026-04-17
version: 0.0.1
status: draft
model: GPT-5.4 Thinking
category: spec
---

# Capture Message and Canonical Item Schema

## Goal
Define the ingress message schema, normalization rules, and canonical captured item shape produced by the capture service; this spec excludes storage representation, markdown layout, GitHub file layout, and database schema.

## 1. Ingress message schema

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

### Ingress shape

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

### Examples

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

## 2. Normalization rules

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

## 3. Canonical captured item

### Principles
The canonical captured item is:
- storage-independent
- self-sufficient for persistence
- independent of markdown/file layout
- independent of storage identity

### Recommended shape

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
```

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

## 4. Enrichment rules

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

## 5. Storage boundary reminder
The canonical item is what the capture service submits to storage.

The storage interface does not require read-back for the capture flow.
It only needs to report success or failure of persistence.

Storage implementations may map the canonical item into:
- markdown files in GitHub
- rows/documents in Supabase
- another representation later

## Tests
- Note-only message: `primary_url: null`, `note: <full text>`
- Link-only message: `primary_url: <url>`, `note: null`
- Link-with-note message: first URL → `primary_url`, remaining text → `note`
- Message with multiple URLs: first URL → `primary_url`, remaining URLs stay inline in `note`
- URLs with `utm_*` params stripped from `primary_url`
- Semantically meaningful query params preserved in `primary_url`
- `kind: note` when no primary URL; `kind: link` when primary URL present
- `source_type: github_repo` for GitHub repository root URL; `source_type: web_page` otherwise
- Enrichment failure sets `enrichment: failed`; item is still submitted to storage
- Note-only item: `enrichment: none`, `source_type: null`, `source: {}`

## Done criteria
- Ingress message parsing implements all normalization rules in section 2
- Canonical item shape matches the schema definition in section 3
- All enumerated test cases pass
