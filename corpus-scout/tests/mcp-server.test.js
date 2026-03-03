import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import test from "node:test"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createMcpServer } from "../src/mcp-server.js"

const execFileAsync = promisify(execFile)

// Helpers

function captureStderr() {
  const lines = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { lines.push(chunk); return true }
  return {
    lines,
    restore: () => { process.stderr.write = original }
  }
}

async function makeConnectedPair(clientStub) {
  const server = createMcpServer(clientStub)
  const mcpClient = new Client({ name: "test-client", version: "0.0.1" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)])
  return { server, mcpClient }
}

function makeStub(overrides = {}) {
  return {
    search: overrides.search ?? (async () => []),
    readSection: overrides.readSection ?? (async () => ({ file: "f.md", content: "", startLine: 1, endLine: 1, truncated: false }))
  }
}

test("search_shouldReturnJsonContent_onSuccess", async () => {
  const searchResult = [{ file: "a.md", line: 3, text: "hello", before: [], after: [] }]
  const { server, mcpClient } = await makeConnectedPair(makeStub({ search: async () => searchResult }))

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "hello" } })

  assert.equal(result.content[0].type, "text")
  assert.deepEqual(JSON.parse(result.content[0].text), searchResult)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnMcpError_onClientFailure", async () => {
  const stub = makeStub({ search: async () => { throw new Error("rg not found") } })
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "test" } })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /rg not found/)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnError_onMissingQuery", async () => {
  const { server, mcpClient } = await makeConnectedPair(makeStub())

  const result = await mcpClient.callTool({ name: "search", arguments: {} })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnError_onEmptyQuery", async () => {
  const { server, mcpClient } = await makeConnectedPair(makeStub())

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "" } })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("search_shouldPassOptionalParams_toClient", async () => {
  let capturedArgs
  const stub = makeStub({
    search: async (query, options) => {
      capturedArgs = { query, options }
      return []
    }
  })
  const { server, mcpClient } = await makeConnectedPair(stub)

  await mcpClient.callTool({
    name: "search",
    arguments: { query: "test", caseSensitive: true, fileGlob: "*.md" }
  })

  assert.equal(capturedArgs.query, "test")
  assert.deepEqual(capturedArgs.options, { caseSensitive: true, fileGlob: "*.md" })

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldReturnContent_onSuccess", async () => {
  const section = { file: "a.md", content: "# Title\nBody", startLine: 1, endLine: 2, truncated: false }
  const stub = makeStub({ readSection: async () => section })
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "read_section", arguments: { file: "a.md" } })

  assert.equal(result.content[0].type, "text")
  assert.deepEqual(JSON.parse(result.content[0].text), section)

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldReturnMcpError_onClientFailure", async () => {
  const stub = makeStub({ readSection: async () => { throw new Error("file not found") } })
  const { server, mcpClient } = await makeConnectedPair(stub)

  const result = await mcpClient.callTool({ name: "read_section", arguments: { file: "missing.md" } })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /file not found/)

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldReturnError_onMissingFile", async () => {
  const { server, mcpClient } = await makeConnectedPair(makeStub())

  const result = await mcpClient.callTool({ name: "read_section", arguments: {} })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldPassHeading_toClient", async () => {
  let capturedArgs
  const stub = makeStub({
    readSection: async (args) => {
      capturedArgs = args
      return { file: args.file, content: "# H\ntext", startLine: 1, endLine: 2, truncated: false }
    }
  })
  const { server, mcpClient } = await makeConnectedPair(stub)

  await mcpClient.callTool({ name: "read_section", arguments: { file: "a.md", heading: "Install" } })

  assert.equal(capturedArgs.file, "a.md")
  assert.equal(capturedArgs.heading, "Install")

  await mcpClient.close()
  await server.close()
})

test("readSection_shouldPassLineRange_toClient", async () => {
  let capturedArgs
  const stub = makeStub({
    readSection: async (args) => {
      capturedArgs = args
      return { file: args.file, content: "line5\nline6", startLine: 5, endLine: 6, truncated: false }
    }
  })
  const { server, mcpClient } = await makeConnectedPair(stub)

  await mcpClient.callTool({ name: "read_section", arguments: { file: "a.md", startLine: 5, endLine: 6 } })

  assert.equal(capturedArgs.startLine, 5)
  assert.equal(capturedArgs.endLine, 6)

  await mcpClient.close()
  await server.close()
})

test("search_shouldWriteSuccessLog_toStderr", async () => {
  const searchResult = [{ file: "a.md", line: 1, text: "x", before: [], after: [] }]
  const { server, mcpClient } = await makeConnectedPair(makeStub({ search: async () => searchResult }))
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
  const { server, mcpClient } = await makeConnectedPair(makeStub())
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

// Startup tests

const indexPath = new URL("../src/index.js", import.meta.url).pathname

test("startup_shouldExitWithError_whenCorpusRootMissing", async () => {
  try {
    await execFileAsync("node", [indexPath], { env: { ...process.env, CORPUS_ROOT: "" } })
    assert.fail("expected non-zero exit")
  } catch (err) {
    assert.notEqual(err.code, 0)
    assert.match(err.stderr, /CORPUS_ROOT/)
  }
})

test("startup_shouldExitWithError_whenCorpusRootNotADirectory", async () => {
  try {
    await execFileAsync("node", [indexPath], { env: { ...process.env, CORPUS_ROOT: "/nonexistent/path" } })
    assert.fail("expected non-zero exit")
  } catch (err) {
    assert.notEqual(err.code, 0)
    assert.match(err.stderr, /not.*directory|does not exist/i)
  }
})

test("startup_shouldWriteStartupLog_toStderr", async () => {
  const child = spawn("node", [indexPath], { env: { ...process.env, CORPUS_ROOT: process.cwd() }, stdio: ["pipe", "pipe", "pipe"] })
  const firstLine = await new Promise((resolve, reject) => {
    let buf = ""
    child.stderr.on("data", (chunk) => {
      buf += chunk.toString()
      const nl = buf.indexOf("\n")
      if (nl !== -1) resolve(buf.slice(0, nl))
    })
    child.on("error", reject)
    setTimeout(() => reject(new Error("timeout waiting for stderr")), 5000)
  })
  child.kill()

  const entry = JSON.parse(firstLine)
  assert.equal(entry.event, "startup")
  assert.equal(entry.corpusRoot, process.cwd())
})
