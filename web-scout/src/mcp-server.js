import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

export function createMcpServer(searxngClient) {
  const server = new McpServer({ name: "web-scout", version: "0.0.1" })

  server.tool(
    "search",
    "Search the web via SearXNG",
    {
      query: z.string().min(1),
      categories: z.string().optional(),
      language: z.string().optional(),
      pageNo: z.number().optional()
    },
    async ({ query, categories, language, pageNo }) => {
      const startMs = Date.now()
      try {
        const result = await searxngClient.search(query, { categories, language, pageNo })
        if (process.env.LOG_LEVEL !== "silent")
          process.stderr.write(JSON.stringify({ event: "search", query, latencyMs: Date.now() - startMs, resultCount: result.results.length }) + "\n")
        return { content: [{ type: "text", text: JSON.stringify(result) }] }
      } catch (err) {
        if (process.env.LOG_LEVEL !== "silent")
          process.stderr.write(JSON.stringify({ event: "search_error", query, latencyMs: Date.now() - startMs, error: err.message }) + "\n")
        return { content: [{ type: "text", text: err.message }], isError: true }
      }
    }
  )

  return server
}
