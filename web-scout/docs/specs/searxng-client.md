---
date: 2026-03-02
model: claude-opus-4-6
description: "Spec: HTTP client for SearXNG /search JSON API"
---

# Spec: SearXNG Client (v0.0.1)

## Goal

HTTP client, owned by web-scout, that queries a SearXNG instance and returns parsed, structured search results.

## Public interface

### Factory

`makeSearxngClient({ baseUrl, timeoutMs?, maxResults? }) -> searxngClient`

- `baseUrl: string` — SearXNG instance URL (e.g. `http://localhost:8888`), required
- `timeoutMs?: number` — HTTP request timeout, defaults to `5000`
- `maxResults?: number` — cap on returned results, defaults to `10`

### Method

`searxngClient.search(query, options?) -> Promise<SearchResult>`

### `query`

`string` — the search query text. Must be non-empty after trim.

### `options` (optional)

- `categories?: string` — SearXNG category filter (e.g. `"general"`, `"images"`)
- `language?: string` — language code (e.g. `"en"`, `"ru"`)
- `pageNo?: number` — page number, defaults to `1`

### `SearchResult`

```js
{
  results: [
    {
      title: string,
      url: string,
      snippet: string,
      engines: string[],
      score: number
    }
  ],
  query: string,
  number_of_results: number
}
```

Each entry in `results` contains only these fields. Extra fields from SearXNG are dropped.

## Behavior rules

1. Sends `GET <baseUrl>/search?q=<query>&format=json` with optional `categories`, `language`, `pageno` params.
2. Throws on empty query (after trim).
3. Throws on non-2xx HTTP response with status code and response body.
4. Throws on response that is not valid JSON.
5. Returns `{ results: [], query, number_of_results: 0 }` when SearXNG returns valid JSON with empty results array.
6. Truncates `results` to `maxResults`.
7. Times out after `timeoutMs` milliseconds.

## Tests (required)

Using an HTTP spy/stub:
- Sends GET request with correct URL, query param, and `format=json`.
- Passes optional `categories`, `language`, `pageno` params when provided.
- Parses valid JSON response and returns structured result.
- Drops extra fields from result entries (only keeps title, url, snippet, engines, score).
- Truncates results to `maxResults`.
- Throws on empty query.
- Throws on non-2xx response.
- Throws on non-JSON response body.
- Returns empty results array when SearXNG returns no results.
- Throws on timeout.

## Done criteria

- Exposes `searxngClient.search`.
- Never swallows errors silently — throws on all failure modes.
- Tests cover all behavior rules.
