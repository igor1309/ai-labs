#!/usr/bin/env node

/**
 * Smoke test for corpus-scout MCP server.
 *
 * Usage:
 *   CORPUS_ROOT=/path/to/corpus node corpus-scout/scripts/smoke.js
 *
 * Exercises both tools (search + read_section) against a real corpus.
 * Exit 0 = PASS, exit 1 = FAIL.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

const root = process.env.CORPUS_ROOT
if (!root) {
  console.error("CORPUS_ROOT is required")
  process.exit(1)
}

const query = process.env.SMOKE_QUERY || "the"

const transport = new StdioClientTransport({
  command: "node",
  args: [new URL("../src/index.js", import.meta.url).pathname],
  env: { ...process.env, CORPUS_ROOT: root }
})
const client = new Client({ name: "smoke-test", version: "0.0.1" })

try {
  await client.connect(transport)

  // search
  const searchResult = await client.callTool({ name: "search", arguments: { query } })
  if (searchResult.isError) throw new Error(`search failed: ${searchResult.content[0].text}`)
  const matches = JSON.parse(searchResult.content[0].text)
  if (!Array.isArray(matches)) throw new Error("search did not return an array")
  console.log(`search "${query}": ${matches.length} matches`)
  if (matches.length === 0) throw new Error("search returned zero matches — is the corpus populated?")
  matches.slice(0, 3).forEach(($0) => console.log(`  ${$0.file}:${$0.line} — ${$0.text.trim().slice(0, 70)}`))

  // read_section (first match)
  const file = matches[0].file
  const sectionResult = await client.callTool({ name: "read_section", arguments: { file } })
  if (sectionResult.isError) throw new Error(`read_section failed: ${sectionResult.content[0].text}`)
  const section = JSON.parse(sectionResult.content[0].text)
  if (typeof section.content !== "string") throw new Error("read_section did not return content string")
  console.log(`read_section "${file}": ${section.endLine - section.startLine + 1} lines, truncated: ${section.truncated}`)

  console.log("\nPASS")
  await client.close()
} catch (err) {
  console.error(`\nFAIL: ${err.message}`)
  try { await client.close() } catch {}
  process.exit(1)
}
