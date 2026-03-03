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
