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
