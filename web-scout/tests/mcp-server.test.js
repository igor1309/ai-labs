import assert from "node:assert/strict"
import test from "node:test"
import { execFile } from "node:child_process"
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

// Tests

test("search_shouldReturnJsonTextContent_onSuccess", async () => {
  const searchResult = {
    results: [{ title: "Example", url: "https://example.com", snippet: "test", engines: ["google"], score: 1.0 }],
    query: "test",
    number_of_results: 1
  }
  const { server, mcpClient } = await makeConnectedPair({ search: async () => searchResult })

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "test" } })

  assert.equal(result.content[0].type, "text")
  assert.deepEqual(JSON.parse(result.content[0].text), searchResult)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnMcpError_onClientFailure", async () => {
  const clientStub = { search: async () => { throw new Error("SearXNG down") } }
  const { server, mcpClient } = await makeConnectedPair(clientStub)

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "test" } })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /SearXNG down/)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnError_onMissingQuery", async () => {
  const clientStub = { search: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(clientStub)

  const result = await mcpClient.callTool({ name: "search", arguments: {} })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("search_shouldReturnError_onEmptyQuery", async () => {
  const clientStub = { search: async () => ({}) }
  const { server, mcpClient } = await makeConnectedPair(clientStub)

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "" } })

  assert.equal(result.isError, true)

  await mcpClient.close()
  await server.close()
})

test("search_shouldPassOptionalParams_toClient", async () => {
  let capturedArgs
  const clientStub = {
    search: async (query, options) => {
      capturedArgs = { query, options }
      return { results: [], query, number_of_results: 0 }
    }
  }
  const { server, mcpClient } = await makeConnectedPair(clientStub)

  await mcpClient.callTool({
    name: "search",
    arguments: { query: "test", categories: "general", language: "en", pageNo: 2 }
  })

  assert.equal(capturedArgs.query, "test")
  assert.deepEqual(capturedArgs.options, { categories: "general", language: "en", pageNo: 2 })

  await mcpClient.close()
  await server.close()
})

test("startup_shouldExitWithError_whenSearxngUrlMissing", async () => {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  await assert.rejects(
    () => execFileAsync("node", [indexPath], { env: { PATH: process.env.PATH } }),
    (err) => {
      assert.match(err.stderr, /SEARXNG_URL/i)
      assert.notEqual(err.code, 0)
      return true
    }
  )
})

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
  if (originalLogLevel === undefined) delete process.env.LOG_LEVEL
  else process.env.LOG_LEVEL = originalLogLevel

  assert.equal(spy.lines.length, 0)

  await mcpClient.close()
  await server.close()
})
