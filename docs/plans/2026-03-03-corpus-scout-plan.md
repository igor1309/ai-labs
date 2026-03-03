---
date: 2026-03-03
model: claude-opus-4-6
description: "Implementation plan: corpus-scout MCP server"
---

# Corpus Scout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable MCP server that exposes lexical search and section reading for any local text corpus via ripgrep.

**Architecture:** Three-file MCP server (`index.js`, `mcp-server.js`, `corpus-client.js`) over stdio, mirroring `web-scout/`. The corpus client wraps ripgrep for search and `node:fs` for section reads. All paths relative to a configurable `CORPUS_ROOT`.

**Tech Stack:** Node.js (ESM), `@modelcontextprotocol/sdk`, `zod`, ripgrep (`rg`) CLI.

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/corpus-scout`
- Expected branch: `codex/corpus-scout`
- Preflight check: [ ] done

---

### Task 1: Scaffold project

**Files:**
- Create: `corpus-scout/package.json`

**Step 1: Create `corpus-scout/package.json`**

```json
{
  "name": "corpus-scout",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^4.0.0"
  }
}
```

**Step 2: Add workspace to root `package.json`**

In root `package.json`, add `"corpus-scout"` to the `workspaces` array:

```json
"workspaces": [
  "nomos",
  "web-scout",
  "corpus-scout"
]
```

**Step 3: Add glob to root test script**

In root `package.json` `scripts.test`, append `corpus-scout/tests/*.test.js` to the node `--test` argument.

**Step 4: Install dependencies**

Run: `npm install`

**Step 5: Commit**

```bash
git add corpus-scout/package.json package.json package-lock.json
git commit -m "scaffold corpus-scout project"
```

---

### Task 2: Corpus client — search via ripgrep

**Files:**
- Create: `corpus-scout/src/corpus-client.js`
- Create: `corpus-scout/tests/corpus-client.test.js`

**Step 1: Write failing tests for `search`**

Create `corpus-scout/tests/corpus-client.test.js`:

```js
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import { makeCorpusClient } from "../src/corpus-client.js"

// Helpers

async function makeTempCorpus(files) {
  const root = await mkdtemp(join(tmpdir(), "corpus-"))
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
  return root
}

// search tests

test("search_shouldReturnMatches_withFileAndLine", async () => {
  const root = await makeTempCorpus({
    "notes.md": "# Notes\nThe protagonist arrives at dawn.\nNothing else."
  })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("protagonist")
    assert.equal(results.length, 1)
    assert.equal(results[0].file, "notes.md")
    assert.equal(results[0].line, 2)
    assert.match(results[0].text, /protagonist/)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldReturnEmptyArray_onNoMatch", async () => {
  const root = await makeTempCorpus({ "notes.md": "nothing here" })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("nonexistent")
    assert.deepEqual(results, [])
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldRespectMaxResults", async () => {
  const lines = Array.from({ length: 5 }, ($0, i) => `match line ${i}`).join("\n")
  const root = await makeTempCorpus({ "many.md": lines })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 2 })
    const results = await client.search("match")
    assert.equal(results.length, 2)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldBeCaseInsensitive_byDefault", async () => {
  const root = await makeTempCorpus({ "notes.md": "The DRAGON sleeps." })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("dragon")
    assert.equal(results.length, 1)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldBeCaseSensitive_whenRequested", async () => {
  const root = await makeTempCorpus({ "notes.md": "The DRAGON sleeps.\nThe dragon wakes." })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("DRAGON", { caseSensitive: true })
    assert.equal(results.length, 1)
    assert.equal(results[0].line, 1)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldFilterByFileGlob_whenProvided", async () => {
  const root = await makeTempCorpus({
    "notes.md": "dragon",
    "data.txt": "dragon"
  })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("dragon", { fileGlob: "**/*.txt" })
    assert.equal(results.length, 1)
    assert.equal(results[0].file, "data.txt")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldIncludeContextLines", async () => {
  const root = await makeTempCorpus({
    "notes.md": "line one\nline two\nthe match\nline four\nline five"
  })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("the match")
    assert.equal(results.length, 1)
    assert.deepEqual(results[0].before, ["line two"])
    assert.deepEqual(results[0].after, ["line four"])
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldReturnRelativePaths", async () => {
  const root = await makeTempCorpus({ "sub/deep/file.md": "keyword here" })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const results = await client.search("keyword")
    assert.equal(results[0].file, "sub/deep/file.md")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldThrow_onEmptyQuery", async () => {
  const client = makeCorpusClient({ root: "/tmp", glob: "**/*.md", maxResults: 20 })
  await assert.rejects(() => client.search(""), { message: /empty query/i })
})
```

**Step 2: Run tests to verify they fail**

Run: `./scripts/run_silent.sh "corpus-client-tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: FAIL — module not found.

**Step 3: Implement `corpus-client.js` — search method**

Create `corpus-scout/src/corpus-client.js`:

```js
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export function makeCorpusClient({ root, glob = "**/*.md", maxResults = 20, maxLines = 200 }) {
  return {
    async search(query, options) {
      if (!query || !query.trim()) throw new Error("Empty query")

      const args = [
        "--json",
        "--no-messages",
        "-C", "1",
        "--glob", options?.fileGlob || glob,
        "-m", String(maxResults)
      ]
      if (!options?.caseSensitive) args.push("-i")
      args.push("--", query, root)

      let stdout
      try {
        const result = await execFileAsync("rg", args)
        stdout = result.stdout
      } catch (err) {
        if (err.code === 1) return []
        throw err
      }

      const matches = []
      const lines = stdout.trim().split("\n").filter(Boolean)
      const pendingContext = new Map()

      for (const line of lines) {
        let msg
        try { msg = JSON.parse(line) } catch { continue }

        if (msg.type === "match") {
          const filePath = msg.data.path.text
          const relative = filePath.startsWith(root)
            ? filePath.slice(root.length).replace(/^\//, "")
            : filePath
          matches.push({
            file: relative,
            line: msg.data.line_number,
            text: msg.data.lines.text.replace(/\n$/, ""),
            before: [],
            after: []
          })
        } else if (msg.type === "context" && matches.length > 0) {
          const last = matches[matches.length - 1]
          const contextLine = msg.data.lines.text.replace(/\n$/, "")
          if (msg.data.line_number < last.line) {
            last.before.push(contextLine)
          } else {
            last.after.push(contextLine)
          }
        }
      }

      return matches.slice(0, maxResults)
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `./scripts/run_silent.sh "corpus-client-tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add corpus-scout/src/corpus-client.js corpus-scout/tests/corpus-client.test.js
git commit -m "add corpus-client search via ripgrep"
```

---

### Task 3: Corpus client — `readSection` (heading mode + line-range mode)

**Files:**
- Modify: `corpus-scout/src/corpus-client.js`
- Modify: `corpus-scout/tests/corpus-client.test.js`

**Step 1: Write failing tests for `readSection`**

Append to `corpus-scout/tests/corpus-client.test.js`:

```js
// readSection tests

const sampleDoc = `# Title
Intro paragraph.

## Characters
Alice is the protagonist.
Bob is the antagonist.

## Plot
The story begins at dawn.

### Act One
First act details.

## Ending
They reconcile.
`

test("readSection_shouldReturnFullFile_whenNoHeadingOrRange", async () => {
  const root = await makeTempCorpus({ "story.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const result = await client.readSection({ file: "story.md" })
    assert.equal(result.file, "story.md")
    assert.match(result.content, /Title/)
    assert.match(result.content, /reconcile/)
    assert.equal(result.startLine, 1)
    assert.equal(result.truncated, false)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldReturnHeadingSection_whenHeadingProvided", async () => {
  const root = await makeTempCorpus({ "story.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const result = await client.readSection({ file: "story.md", heading: "Characters" })
    assert.match(result.content, /Alice/)
    assert.match(result.content, /Bob/)
    assert.ok(!result.content.includes("Plot"))
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldIncludeSubheadings_inSection", async () => {
  const root = await makeTempCorpus({ "story.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const result = await client.readSection({ file: "story.md", heading: "Plot" })
    assert.match(result.content, /Act One/)
    assert.match(result.content, /First act/)
    assert.ok(!result.content.includes("Ending"))
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldReturnLineRange_whenStartAndEndProvided", async () => {
  const root = await makeTempCorpus({ "story.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    const result = await client.readSection({ file: "story.md", startLine: 4, endLine: 7 })
    assert.match(result.content, /Characters/)
    assert.match(result.content, /Bob/)
    assert.equal(result.startLine, 4)
    assert.equal(result.endLine, 7)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldTruncate_whenExceedingMaxLines", async () => {
  const longContent = Array.from({ length: 300 }, ($0, i) => `line ${i}`).join("\n")
  const root = await makeTempCorpus({ "long.md": longContent })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20, maxLines: 10 })
    const result = await client.readSection({ file: "long.md" })
    assert.equal(result.truncated, true)
    assert.equal(result.content.split("\n").length, 10)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldThrow_onDirectoryTraversal", async () => {
  const root = await makeTempCorpus({ "notes.md": "ok" })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    await assert.rejects(
      () => client.readSection({ file: "../../../etc/passwd" }),
      { message: /outside corpus/i }
    )
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldThrow_onMissingFile", async () => {
  const root = await makeTempCorpus({})
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    await assert.rejects(
      () => client.readSection({ file: "nonexistent.md" }),
      { code: "ENOENT" }
    )
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldThrow_onHeadingNotFound", async () => {
  const root = await makeTempCorpus({ "story.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root, glob: "**/*.md", maxResults: 20 })
    await assert.rejects(
      () => client.readSection({ file: "story.md", heading: "Nonexistent" }),
      { message: /heading.*not found/i }
    )
  } finally {
    await rm(root, { recursive: true })
  }
})
```

**Step 2: Run tests to verify new tests fail**

Run: `./scripts/run_silent.sh "corpus-client-tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: FAIL — `readSection` not defined.

**Step 3: Implement `readSection` in `corpus-client.js`**

Add to the returned object in `makeCorpusClient`:

```js
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

// Inside makeCorpusClient, add to the returned object:

    async readSection({ file, heading, startLine, endLine }) {
      const absPath = resolve(root, file)
      if (!absPath.startsWith(resolve(root) + "/") && absPath !== resolve(root))
        throw new Error("Path outside corpus root")

      const raw = await readFile(absPath, "utf-8")
      const allLines = raw.split("\n")

      if (startLine != null && endLine != null) {
        const sliced = allLines.slice(startLine - 1, endLine)
        return {
          file,
          content: sliced.join("\n"),
          startLine,
          endLine,
          truncated: false
        }
      }

      if (heading) {
        const headingPattern = new RegExp(`^(#{1,6})\\s+${escapeRegex(heading)}\\s*$`)
        let sectionStart = -1
        let sectionLevel = 0
        for (let i = 0; i < allLines.length; i++) {
          const match = allLines[i].match(headingPattern)
          if (match) {
            sectionStart = i
            sectionLevel = match[1].length
            break
          }
        }
        if (sectionStart === -1) throw new Error(`Heading "${heading}" not found`)

        let sectionEnd = allLines.length
        for (let i = sectionStart + 1; i < allLines.length; i++) {
          const headMatch = allLines[i].match(/^(#{1,6})\s/)
          if (headMatch && headMatch[1].length <= sectionLevel) {
            sectionEnd = i
            break
          }
        }
        const section = allLines.slice(sectionStart, sectionEnd)
        const truncated = section.length > maxLines
        const content = truncated ? section.slice(0, maxLines).join("\n") : section.join("\n")
        return {
          file,
          content,
          startLine: sectionStart + 1,
          endLine: Math.min(sectionStart + section.length, sectionStart + maxLines),
          truncated
        }
      }

      // Full file
      const truncated = allLines.length > maxLines
      const content = truncated ? allLines.slice(0, maxLines).join("\n") : raw
      return {
        file,
        content,
        startLine: 1,
        endLine: truncated ? maxLines : allLines.length,
        truncated
      }
    }

// Helper at module scope:
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
```

**Step 4: Run tests to verify they pass**

Run: `./scripts/run_silent.sh "corpus-client-tests" node --test corpus-scout/tests/corpus-client.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add corpus-scout/src/corpus-client.js corpus-scout/tests/corpus-client.test.js
git commit -m "add corpus-client readSection with heading and line-range modes"
```

---

### Task 4: MCP server — `search` and `read_section` tools

**Files:**
- Create: `corpus-scout/src/mcp-server.js`
- Create: `corpus-scout/tests/mcp-server.test.js`

**Step 1: Write failing tests**

Create `corpus-scout/tests/mcp-server.test.js`:

```js
import assert from "node:assert/strict"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createMcpServer } from "../src/mcp-server.js"

// Helpers

async function makeConnectedPair(clientStub) {
  const server = createMcpServer(clientStub)
  const mcpClient = new Client({ name: "test-client", version: "0.0.1" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)])
  return { server, mcpClient }
}

function captureStderr() {
  const lines = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { lines.push(chunk); return true }
  return { lines, restore: () => { process.stderr.write = original } }
}

// search tool tests

test("search_shouldReturnJsonContent_onSuccess", async () => {
  const searchResult = [{ file: "notes.md", line: 1, text: "match", before: [], after: [] }]
  const stub = { search: async () => searchResult, readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "match" } })

  assert.equal(result.content[0].type, "text")
  assert.deepEqual(JSON.parse(result.content[0].text), searchResult)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnMcpError_onClientFailure", async () => {
  const stub = { search: async () => { throw new Error("rg not found") }, readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "test" } })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /rg not found/)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnError_onMissingQuery", async () => {
  const stub = { search: async () => [], readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "search", arguments: {} })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnError_onEmptyQuery", async () => {
  const stub = { search: async () => [], readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "" } })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("search_shouldPassOptionalParams_toClient", async () => {
  let capturedArgs
  const stub = {
    search: async (query, options) => { capturedArgs = { query, options }; return [] },
    readSection: async () => ({})
  }
  const { server, mcpClient } = await makeConnectedPair(stub)

  await mcpClient.callTool({ name: "search", arguments: { query: "test", caseSensitive: true, fileGlob: "**/*.txt" } })

  assert.equal(capturedArgs.query, "test")
  assert.equal(capturedArgs.options.caseSensitive, true)
  assert.equal(capturedArgs.options.fileGlob, "**/*.txt")

  await mcpClient.close()
  await server.close()
})

// read_section tool tests

test("readSection_shouldReturnContent_onSuccess", async () => {
  const sectionResult = { file: "story.md", content: "# Title\nContent", startLine: 1, endLine: 2, truncated: false }
  const stub = { search: async () => [], readSection: async () => sectionResult }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "read_section", arguments: { file: "story.md" } })

  assert.equal(result.content[0].type, "text")
  assert.deepEqual(JSON.parse(result.content[0].text), sectionResult)

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldReturnMcpError_onClientFailure", async () => {
  const stub = { search: async () => [], readSection: async () => { throw new Error("File not found") } }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "read_section", arguments: { file: "missing.md" } })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /File not found/)

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldReturnError_onMissingFile", async () => {
  const stub = { search: async () => [], readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "read_section", arguments: {} })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldPassHeading_toClient", async () => {
  let capturedArgs
  const stub = {
    search: async () => [],
    readSection: async (args) => { capturedArgs = args; return { file: "f", content: "", startLine: 1, endLine: 1, truncated: false } }
  }
  const { server, mcpClient } = await makeConnectedPair(stub)

  await mcpClient.callTool({ name: "read_section", arguments: { file: "story.md", heading: "Characters" } })

  assert.equal(capturedArgs.file, "story.md")
  assert.equal(capturedArgs.heading, "Characters")

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldPassLineRange_toClient", async () => {
  let capturedArgs
  const stub = {
    search: async () => [],
    readSection: async (args) => { capturedArgs = args; return { file: "f", content: "", startLine: 5, endLine: 10, truncated: false } }
  }
  const { server, mcpClient } = await makeConnectedPair(stub)

  await mcpClient.callTool({ name: "read_section", arguments: { file: "story.md", startLine: 5, endLine: 10 } })

  assert.equal(capturedArgs.startLine, 5)
  assert.equal(capturedArgs.endLine, 10)

  await mcpClient.close()
  await server.close()
})

// logging tests

test("search_shouldWriteSuccessLog_toStderr", async () => {
  const stub = { search: async () => [{ file: "f", line: 1, text: "t", before: [], after: [] }], readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)
  const spy = captureStderr()
  try {
    await mcpClient.callTool({ name: "search", arguments: { query: "q" } })
  } finally {
    spy.restore()
  }

  assert.equal(spy.lines.length, 1)
  const entry = JSON.parse(spy.lines[0])
  assert.equal(entry.event, "search")
  assert.equal(entry.query, "q")
  assert.equal(typeof entry.latencyMs, "number")
  assert.equal(entry.resultCount, 1)

  await mcpClient.close()
  await server.close()
})

test("search_shouldNotWriteLog_whenLogLevelSilent", async () => {
  const stub = { search: async () => [], readSection: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(stub)
  const originalLogLevel = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = "silent"
  const spy = captureStderr()
  try {
    await mcpClient.callTool({ name: "search", arguments: { query: "q" } })
  } finally {
    spy.restore()
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = originalLogLevel
  }

  assert.equal(spy.lines.length, 0)

  await mcpClient.close()
  await server.close()
})
```

**Step 2: Run tests to verify they fail**

Run: `./scripts/run_silent.sh "mcp-server-tests" node --test corpus-scout/tests/mcp-server.test.js`
Expected: FAIL — module not found.

**Step 3: Implement `mcp-server.js`**

Create `corpus-scout/src/mcp-server.js`:

```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

export function createMcpServer(corpusClient) {
  const server = new McpServer({ name: "corpus-scout", version: "0.0.1" })

  server.tool(
    "search",
    "Search the corpus for a pattern using ripgrep",
    {
      query: z.string().min(1),
      caseSensitive: z.boolean().optional(),
      fileGlob: z.string().optional()
    },
    async ({ query, caseSensitive, fileGlob }) => {
      const startMs = Date.now()
      try {
        const results = await corpusClient.search(query, { caseSensitive, fileGlob })
        if (process.env.LOG_LEVEL !== "silent")
          process.stderr.write(JSON.stringify({ event: "search", query, latencyMs: Date.now() - startMs, resultCount: results.length }) + "\n")
        return { content: [{ type: "text", text: JSON.stringify(results) }] }
      } catch (err) {
        if (process.env.LOG_LEVEL !== "silent")
          process.stderr.write(JSON.stringify({ event: "search_error", query, latencyMs: Date.now() - startMs, error: err.message }) + "\n")
        return { content: [{ type: "text", text: err.message }], isError: true }
      }
    }
  )

  server.tool(
    "read_section",
    "Read a file or a specific section from it",
    {
      file: z.string().min(1),
      heading: z.string().optional(),
      startLine: z.number().optional(),
      endLine: z.number().optional()
    },
    async ({ file, heading, startLine, endLine }) => {
      const startMs = Date.now()
      try {
        const result = await corpusClient.readSection({ file, heading, startLine, endLine })
        if (process.env.LOG_LEVEL !== "silent")
          process.stderr.write(JSON.stringify({ event: "read_section", file, latencyMs: Date.now() - startMs, lines: result.content.split("\n").length }) + "\n")
        return { content: [{ type: "text", text: JSON.stringify(result) }] }
      } catch (err) {
        if (process.env.LOG_LEVEL !== "silent")
          process.stderr.write(JSON.stringify({ event: "read_section_error", file, latencyMs: Date.now() - startMs, error: err.message }) + "\n")
        return { content: [{ type: "text", text: err.message }], isError: true }
      }
    }
  )

  return server
}
```

**Step 4: Run tests to verify they pass**

Run: `./scripts/run_silent.sh "mcp-server-tests" node --test corpus-scout/tests/mcp-server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add corpus-scout/src/mcp-server.js corpus-scout/tests/mcp-server.test.js
git commit -m "add mcp-server with search and read_section tools"
```

---

### Task 5: Composition root (`index.js`) + startup tests

**Files:**
- Create: `corpus-scout/src/index.js`
- Modify: `corpus-scout/tests/mcp-server.test.js` (add startup tests)

**Step 1: Write failing startup tests**

Append to `corpus-scout/tests/mcp-server.test.js`:

```js
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

test("startup_shouldExitWithError_whenCorpusRootMissing", async () => {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  await assert.rejects(
    () => execFileAsync("node", [indexPath], { env: { PATH: process.env.PATH } }),
    (err) => {
      assert.match(err.stderr, /CORPUS_ROOT/i)
      assert.notEqual(err.code, 0)
      return true
    }
  )
})

test("startup_shouldExitWithError_whenCorpusRootNotADirectory", async () => {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  await assert.rejects(
    () => execFileAsync("node", [indexPath], { env: { PATH: process.env.PATH, CORPUS_ROOT: "/nonexistent/path" } }),
    (err) => {
      assert.match(err.stderr, /not a directory|does not exist/i)
      assert.notEqual(err.code, 0)
      return true
    }
  )
})

test("startup_shouldWriteStartupLog_toStderr", async () => {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  const child = spawn("node", [indexPath], {
    env: { ...process.env, CORPUS_ROOT: process.cwd() },
    stdio: ["pipe", "pipe", "pipe"]
  })

  const line = await new Promise((resolve, reject) => {
    child.stderr.once("data", (chunk) => resolve(chunk.toString()))
    child.once("error", reject)
    setTimeout(() => reject(new Error("timeout waiting for startup log")), 3000)
  })

  child.kill()

  let entry
  try { entry = JSON.parse(line.trim()) } catch { assert.fail(`Expected JSON startup log, got: ${JSON.stringify(line)}`) }
  assert.equal(entry.event, "startup")
  assert.equal(entry.corpusRoot, process.cwd())
})
```

**Step 2: Run tests to verify they fail**

Run: `./scripts/run_silent.sh "startup-tests" node --test corpus-scout/tests/mcp-server.test.js`
Expected: FAIL — `index.js` not found.

**Step 3: Implement `index.js`**

Create `corpus-scout/src/index.js`:

```js
import { stat } from "node:fs/promises"
import { createMcpServer } from "./mcp-server.js"
import { makeCorpusClient } from "./corpus-client.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const root = process.env.CORPUS_ROOT
if (!root) {
  process.stderr.write("CORPUS_ROOT is required\n")
  process.exit(1)
}

let rootStat
try {
  rootStat = await stat(root)
} catch {
  process.stderr.write(`CORPUS_ROOT does not exist: ${root}\n`)
  process.exit(1)
}
if (!rootStat.isDirectory()) {
  process.stderr.write(`CORPUS_ROOT is not a directory: ${root}\n`)
  process.exit(1)
}

const glob = process.env.CORPUS_GLOB || undefined
const maxResults = Number(process.env.CORPUS_MAX_RESULTS) || undefined
const maxLines = Number(process.env.CORPUS_MAX_LINES) || undefined

const client = makeCorpusClient({ root, glob, maxResults, maxLines })

if (process.env.LOG_LEVEL !== "silent")
  process.stderr.write(JSON.stringify({ event: "startup", corpusRoot: root, glob, maxResults, maxLines }) + "\n")

const server = createMcpServer(client)
await server.connect(new StdioServerTransport())
```

**Step 4: Run tests to verify they pass**

Run: `./scripts/run_silent.sh "startup-tests" node --test corpus-scout/tests/mcp-server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add corpus-scout/src/index.js corpus-scout/tests/mcp-server.test.js
git commit -m "add composition root with startup validation"
```

---

### Task 6: E2E test

**Files:**
- Create: `corpus-scout/tests/e2e.test.js`

**Step 1: Write E2E test**

Create `corpus-scout/tests/e2e.test.js`:

```js
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

// Helpers

async function makeTempCorpus(files) {
  const root = await mkdtemp(join(tmpdir(), "corpus-e2e-"))
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
  return root
}

async function makeE2eClient(corpusRoot) {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  const transport = new StdioClientTransport({
    command: "node",
    args: [indexPath],
    env: { ...process.env, CORPUS_ROOT: corpusRoot }
  })
  const client = new Client({ name: "e2e-test", version: "0.0.1" })
  await client.connect(transport)
  return client
}

// Tests

test("e2e_shouldReturnSearchResults_viaStdioTransport", async () => {
  const root = await makeTempCorpus({
    "characters/hero.md": "# Hero\nThe brave knight ventures forth.\n",
    "plot/act1.md": "# Act One\nThe knight meets the dragon.\n"
  })
  try {
    const client = await makeE2eClient(root)

    const result = await client.callTool({ name: "search", arguments: { query: "knight" } })

    await client.close()

    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text)
    assert.equal(parsed.length, 2)
    assert.deepEqual(parsed.map(($0) => $0.file).sort(), ["characters/hero.md", "plot/act1.md"])
  } finally {
    await rm(root, { recursive: true })
  }
})

test("e2e_shouldReturnSection_viaStdioTransport", async () => {
  const root = await makeTempCorpus({
    "story.md": "# Title\nIntro.\n\n## Chapter One\nThe story begins.\n\n## Chapter Two\nIt continues.\n"
  })
  try {
    const client = await makeE2eClient(root)

    const result = await client.callTool({ name: "read_section", arguments: { file: "story.md", heading: "Chapter One" } })

    await client.close()

    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text)
    assert.match(parsed.content, /story begins/)
    assert.ok(!parsed.content.includes("Chapter Two"))
  } finally {
    await rm(root, { recursive: true })
  }
})
```

**Step 2: Run E2E tests**

Run: `./scripts/run_silent.sh "e2e-tests" node --test corpus-scout/tests/e2e.test.js`
Expected: PASS (all infrastructure from prior tasks)

**Step 3: Run full test suite**

Run: `./scripts/run_silent.sh "tests" npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add corpus-scout/tests/e2e.test.js
git commit -m "add e2e tests for corpus-scout"
```

---

### Task 7: CI workflow + integration

**Files:**
- Create: `.github/workflows/corpus-scout-core.yml`
- Modify: `.github/workflows/ci.yml`

**Step 1: Create `corpus-scout-core.yml`**

```yaml
name: Corpus Scout Core

on:
  workflow_call:
    inputs:
      ref:
        description: "Git ref to checkout."
        required: false
        type: string

permissions:
  contents: read

jobs:
  core:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref || github.sha }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install ripgrep
        run: sudo apt-get install -y ripgrep

      - name: Typecheck
        run: ./scripts/run_silent.sh "build" npx tsc --noEmit

      - name: Run tests
        run: ./scripts/run_silent.sh "tests" node --test corpus-scout/tests/*.test.js
```

**Step 2: Add `corpus-scout` filter and job to `ci.yml`**

In `ci.yml`:

1. Add to `changes.outputs`:
   ```yaml
   corpus-scout: ${{ steps.filter.outputs.corpus-scout }}
   ```

2. Add to the `filters` block:
   ```yaml
   corpus-scout:
     - "corpus-scout/**"
   ```

3. Add the job:
   ```yaml
   corpus-scout-core:
     needs: [changes]
     if: ${{ github.event_name == 'workflow_dispatch' || needs.changes.outputs.corpus-scout == 'true' || needs.changes.outputs.shared == 'true' }}
     uses: ./.github/workflows/corpus-scout-core.yml
   ```

4. Add `corpus-scout-core` to the `notify` job's `needs` array and `if` condition.

**Step 3: Run full test suite locally**

Run: `./scripts/run_silent.sh "tests" npm test`
Expected: PASS

**Step 4: Run typecheck**

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add .github/workflows/corpus-scout-core.yml .github/workflows/ci.yml
git commit -m "add corpus-scout CI workflow"
```

---

### Task 8: Final gates and spec

**Files:**
- Create: `corpus-scout/docs/specs/corpus-scout.md`
- Move: `docs/plans/2026-03-03-corpus-scout-plan.md` → `docs/plans/implemented/`

**Step 1: Write the spec**

Create `corpus-scout/docs/specs/corpus-scout.md` following the spec format (Goal, Public interface, Behavior rules, Tests, Done criteria) based on the design doc.

**Step 2: Run final gates**

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`
Run: `./scripts/run_silent.sh "tests" npm test`
Expected: both PASS

**Step 3: Move plan to implemented**

```bash
mv docs/plans/2026-03-03-corpus-scout-plan.md docs/plans/implemented/
```

**Step 4: Commit and push**

```bash
git add corpus-scout/docs/specs/corpus-scout.md docs/plans/implemented/2026-03-03-corpus-scout-plan.md
git commit -m "add corpus-scout spec, move plan to implemented"
```

**Step 5: Create PR**

```bash
gh pr create --title "add corpus-scout MCP server" --body "$(cat <<'EOF'
## Summary
- New reusable MCP server for lexical search and section reading over any local text corpus
- Two tools: `search` (ripgrep-based) and `read_section` (heading + line-range modes)
- Configurable via env vars: CORPUS_ROOT, CORPUS_GLOB, CORPUS_MAX_RESULTS, CORPUS_MAX_LINES
- Implements ADR-0001 file-first retrieval architecture

## Test plan
- [ ] Unit tests for corpus-client (search + readSection)
- [ ] MCP protocol tests via InMemoryTransport
- [ ] E2E tests via StdioClientTransport with temp corpus
- [ ] CI workflow runs on ubuntu with ripgrep installed
EOF
)" --base trunk
```
