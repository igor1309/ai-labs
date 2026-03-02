import assert from "node:assert/strict"
import http from "node:http"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

// Helpers

function makeMockSearxng(response) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(response))
    })
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

async function makeE2eClient(searxngUrl) {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  const transport = new StdioClientTransport({
    command: "node",
    args: [indexPath],
    env: { ...process.env, SEARXNG_URL: searxngUrl }
  })
  const client = new Client({ name: "e2e-test", version: "0.0.1" })
  await client.connect(transport)
  return client
}

// Tests

test("e2e_shouldReturnSearchResults_viaStdioTransport", async () => {
  const mockResponse = {
    query: "rust async",
    number_of_results: 1,
    results: [{ title: "Async Rust", url: "https://rust-lang.org", snippet: "async/await in Rust", engines: ["google"], score: 1.0 }]
  }
  const mockServer = await makeMockSearxng(mockResponse)
  const { port } = mockServer.address()
  const client = await makeE2eClient(`http://127.0.0.1:${port}`)

  const result = await client.callTool({ name: "search", arguments: { query: "rust async" } })

  await client.close()
  mockServer.close()

  assert.equal(result.isError, undefined)
  assert.equal(result.content[0].type, "text")
  const parsed = JSON.parse(result.content[0].text)
  assert.equal(parsed.query, "rust async")
  assert.equal(parsed.results.length, 1)
  assert.equal(parsed.results[0].title, "Async Rust")
  assert.equal(parsed.results[0].url, "https://rust-lang.org")
})
