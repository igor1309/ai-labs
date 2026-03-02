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
