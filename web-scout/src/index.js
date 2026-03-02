import { makeSearxngClient } from "./searxng-client.js"
import { createMcpServer } from "./mcp-server.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const url = process.env.SEARXNG_URL
if (!url) {
  process.stderr.write("SEARXNG_URL is required\n")
  process.exit(1)
}

const client = makeSearxngClient({
  baseUrl: url,
  timeoutMs: Number(process.env.SEARXNG_TIMEOUT_MS) || undefined,
  maxResults: Number(process.env.SEARXNG_MAX_RESULTS) || undefined
})

const server = createMcpServer(client)
await server.connect(new StdioServerTransport())
