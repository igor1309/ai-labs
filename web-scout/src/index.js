import { makeSearxngClient } from "./searxng-client.js"
import { createMcpServer } from "./mcp-server.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const url = process.env.SEARXNG_URL
if (!url) {
  process.stderr.write("SEARXNG_URL is required\n")
  process.exit(1)
}

const timeoutMs = Number(process.env.SEARXNG_TIMEOUT_MS) || undefined
const maxResults = Number(process.env.SEARXNG_MAX_RESULTS) || undefined

const client = makeSearxngClient({ baseUrl: url, timeoutMs, maxResults })

if (process.env.LOG_LEVEL !== "silent")
  process.stderr.write(JSON.stringify({ event: "startup", searxngUrl: url, timeoutMs, maxResults }) + "\n")

const server = createMcpServer(client)
await server.connect(new StdioServerTransport())
