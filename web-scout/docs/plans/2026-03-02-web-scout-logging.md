---
date: 2026-03-02
model: claude-sonnet-4-6
description: "Implementation plan: structured logging for web-scout (v0.0.2 logging scope)"
---

# web-scout Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured JSON logging to stderr in `mcp-server.js` (per tool call) and `index.js` (startup), controlled by `LOG_LEVEL` env var.

**Architecture:** Inline `process.stderr.write` calls at each log site, guarded by `process.env.LOG_LEVEL !== "silent"`. No new module, no new dependency. Latency captured with `Date.now()` before/after `searxngClient.search`.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`

---

## Worktree required: no
## Expected branch: trunk
## Preflight check: [ ] done

---

### Task 1: Update the spec

**Files:**
- Modify: `web-scout/docs/specs/implemented/mcp-server.md`

**Step 1: Add Rule 6 and LOG_LEVEL to the spec**

In `mcp-server.md`, add `LOG_LEVEL` to the Configuration section and Rule 6 to Behavior rules:

Configuration (add after `SEARXNG_MAX_RESULTS`):
```
- `LOG_LEVEL` — logging verbosity; `info` (default) logs every call, `silent` suppresses all output
```

Behavior rules (add Rule 6):
```
6. Writes a JSON line to `stderr` for each tool call: `{event, query, latencyMs, resultCount}` on success; `{event, query, latencyMs, error}` on failure. Suppressed when `LOG_LEVEL=silent`.
```

Also add to Tests section:
```
Logging:
- Writes a JSON line to stderr on successful search with {event, query, latencyMs, resultCount}.
- Writes a JSON line to stderr on search failure with {event, query, latencyMs, error}.
- Does not write to stderr when LOG_LEVEL=silent.
```

**Step 2: Commit**

```bash
git add web-scout/docs/specs/implemented/mcp-server.md
git commit -m "update mcp-server spec: add logging rule and LOG_LEVEL config"
```

---

### Task 2: Write failing tests for mcp-server.js logging

**Files:**
- Modify: `web-scout/tests/mcp-server.test.js`

**Step 1: Add a `captureStderr` helper at the top of the Helpers section**

Add after `makeConnectedPair`:

```js
function captureStderr() {
  const lines = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { lines.push(chunk); return true }
  return {
    lines,
    restore: () => { process.stderr.write = original }
  }
}
```

**Step 2: Add three new test cases at the bottom of the Tests section**

```js
test("search_shouldWriteSuccessLogToStderr_onSuccess", async () => {
  const searchResult = { results: [{ title: "T", url: "http://x.com", snippet: "s", engines: ["g"], score: 1 }], query: "q", number_of_results: 1 }
  const { server, mcpClient } = await makeConnectedPair({ search: async () => searchResult })
  const spy = captureStderr()

  await mcpClient.callTool({ name: "search", arguments: { query: "q" } })
  spy.restore()

  assert.equal(spy.lines.length, 1)
  const entry = JSON.parse(spy.lines[0])
  assert.equal(entry.event, "search")
  assert.equal(entry.query, "q")
  assert.equal(typeof entry.latencyMs, "number")
  assert.equal(entry.resultCount, 1)

  await mcpClient.close()
  await server.close()
})

test("search_shouldWriteErrorLogToStderr_onClientFailure", async () => {
  const clientStub = { search: async () => { throw new Error("SearXNG down") } }
  const { server, mcpClient } = await makeConnectedPair(clientStub)
  const spy = captureStderr()

  await mcpClient.callTool({ name: "search", arguments: { query: "q" } })
  spy.restore()

  assert.equal(spy.lines.length, 1)
  const entry = JSON.parse(spy.lines[0])
  assert.equal(entry.event, "search_error")
  assert.equal(entry.query, "q")
  assert.equal(typeof entry.latencyMs, "number")
  assert.equal(entry.error, "SearXNG down")

  await mcpClient.close()
  await server.close()
})

test("search_shouldNotWriteToStderr_whenLogLevelSilent", async () => {
  const searchResult = { results: [], query: "q", number_of_results: 0 }
  const { server, mcpClient } = await makeConnectedPair({ search: async () => searchResult })
  const originalLogLevel = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = "silent"
  const spy = captureStderr()

  await mcpClient.callTool({ name: "search", arguments: { query: "q" } })
  spy.restore()
  process.env.LOG_LEVEL = originalLogLevel

  assert.equal(spy.lines.length, 0)

  await mcpClient.close()
  await server.close()
})
```

**Step 3: Run tests to confirm RED**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: 3 new tests fail (no logging implemented yet). Existing 6 tests pass.

---

### Task 3: Implement logging in mcp-server.js

**Files:**
- Modify: `web-scout/src/mcp-server.js`

**Step 1: Add latency timing and log writes to the tool handler**

Replace the current tool handler body:

```js
async ({ query, categories, language, pageNo }) => {
  try {
    const result = await searxngClient.search(query, { categories, language, pageNo })
    return { content: [{ type: "text", text: JSON.stringify(result) }] }
  } catch (err) {
    return { content: [{ type: "text", text: err.message }], isError: true }
  }
}
```

With:

```js
async ({ query, categories, language, pageNo }) => {
  const startMs = Date.now()
  try {
    const result = await searxngClient.search(query, { categories, language, pageNo })
    if (process.env.LOG_LEVEL !== "silent")
      process.stderr.write(JSON.stringify({ event: "search", query, latencyMs: Date.now() - startMs, resultCount: result.results?.length ?? 0 }) + "\n")
    return { content: [{ type: "text", text: JSON.stringify(result) }] }
  } catch (err) {
    if (process.env.LOG_LEVEL !== "silent")
      process.stderr.write(JSON.stringify({ event: "search_error", query, latencyMs: Date.now() - startMs, error: err.message }) + "\n")
    return { content: [{ type: "text", text: err.message }], isError: true }
  }
}
```

**Step 2: Run tests to confirm GREEN**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all 9 tests pass.

**Step 3: Commit**

```bash
git add web-scout/src/mcp-server.js web-scout/tests/mcp-server.test.js
git commit -m "add per-call structured logging to mcp-server"
```

---

### Task 4: Add startup log to index.js

**Files:**
- Modify: `web-scout/src/index.js`

**Step 1: Add startup log after client creation, before server.connect**

Current `index.js`:
```js
const client = makeSearxngClient({
  baseUrl: url,
  timeoutMs: Number(process.env.SEARXNG_TIMEOUT_MS) || undefined,
  maxResults: Number(process.env.SEARXNG_MAX_RESULTS) || undefined
})

const server = createMcpServer(client)
await server.connect(new StdioServerTransport())
```

Updated `index.js`:
```js
const timeoutMs = Number(process.env.SEARXNG_TIMEOUT_MS) || undefined
const maxResults = Number(process.env.SEARXNG_MAX_RESULTS) || undefined

const client = makeSearxngClient({ baseUrl: url, timeoutMs, maxResults })

if (process.env.LOG_LEVEL !== "silent")
  process.stderr.write(JSON.stringify({ event: "startup", searxngUrl: url, timeoutMs, maxResults }) + "\n")

const server = createMcpServer(client)
await server.connect(new StdioServerTransport())
```

**Step 2: Run tests to confirm all still pass**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all 9 tests pass (startup log is not captured by existing tests — that's acceptable; it's a one-liner on a code path that exits immediately if `SEARXNG_URL` is missing, and is verified by observation in the next task's manual smoke).

**Step 3: Commit**

```bash
git add web-scout/src/index.js
git commit -m "add startup log to index.js"
```

---

### Task 5: Final gate

**Step 1: Run full test suite**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all 9 tests pass.

**Step 2: Run build check**

```bash
./scripts/run_silent.sh "build" npx tsc --noEmit
```

Expected: no errors (project is JS, so this may be a no-op or pass immediately).

**Step 3: Push**

```bash
git push origin trunk
```

---

## Done criteria

- `mcp-server.js` writes `{event:"search", query, latencyMs, resultCount}` to stderr on success.
- `mcp-server.js` writes `{event:"search_error", query, latencyMs, error}` to stderr on failure.
- `LOG_LEVEL=silent` suppresses all writes.
- `index.js` writes `{event:"startup", searxngUrl, timeoutMs, maxResults}` on boot.
- All 9 tests pass.
- Spec updated with Rule 6 and `LOG_LEVEL` config entry.
