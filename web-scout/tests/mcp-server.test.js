import assert from "node:assert/strict"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createMcpServer } from "../src/mcp-server.js"

test("search_shouldReturnJsonTextContent_onSuccess", async () => {
  const searchResult = {
    results: [{ title: "Example", url: "https://example.com", snippet: "test", engines: ["google"], score: 1.0 }],
    query: "test",
    number_of_results: 1
  }
  const clientStub = { search: async () => searchResult }
  const server = createMcpServer(clientStub)
  const mcpClient = new Client({ name: "test-client", version: "0.0.1" })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)])

  const result = await mcpClient.callTool({ name: "search", arguments: { query: "test" } })

  assert.equal(result.content[0].type, "text")
  assert.deepEqual(JSON.parse(result.content[0].text), searchResult)

  await mcpClient.close()
  await server.close()
})
