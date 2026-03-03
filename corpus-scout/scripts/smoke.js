#!/usr/bin/env node

/**
 * Smoke test for corpus-scout MCP server.
 *
 * Usage:
 *   CORPUS_ROOT=/path/to/corpus node corpus-scout/scripts/smoke.js
 *
 * Exercises both tools (search + read_section) against a real corpus.
 * Requires LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY to be set.
 * Exit 0 = PASS, exit 1 = FAIL.
 */

import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Langfuse } from "langfuse"

/**
 * Core smoke logic. callTool(toolName, args) must return an MCP tool result.
 * Returns { matchCount, lineCount, truncated, firstFile } on success, throws on failure.
 */
export async function runSmoke(callTool, query) {
  const searchResult = await callTool("search", { query })
  if (searchResult.isError) throw new Error(`search failed: ${searchResult.content[0].text}`)
  const matches = JSON.parse(searchResult.content[0].text)
  if (!Array.isArray(matches)) throw new Error("search did not return an array")
  if (matches.length === 0) throw new Error("search returned zero matches — is the corpus populated?")

  const file = matches[0].file
  const sectionResult = await callTool("read_section", { file })
  if (sectionResult.isError) throw new Error(`read_section failed: ${sectionResult.content[0].text}`)
  const section = JSON.parse(sectionResult.content[0].text)
  if (typeof section.content !== "string") throw new Error("read_section did not return content string")

  return {
    matchCount: matches.length,
    lineCount: section.endLine - section.startLine + 1,
    truncated: section.truncated,
    firstFile: file,
  }
}

/**
 * Returns a Langfuse client when keys are present, null otherwise.
 * Pass LangfuseClass to inject a mock for testing.
 */
export function makeLangfuseClient(env, LangfuseClass = Langfuse) {
  const secret = env.LANGFUSE_SECRET_KEY
  const pub = env.LANGFUSE_PUBLIC_KEY
  if (!secret || !pub) return null
  const opts = { secretKey: secret, publicKey: pub }
  if (env.LANGFUSE_BASE_URL) opts.baseUrl = env.LANGFUSE_BASE_URL
  return new LangfuseClass(opts)
}

/**
 * Runs smoke with Langfuse tracing.
 * Tags the trace as ["smoke", "corpus-scout"] for Langfuse dashboard filtering.
 * Returns { pass: bool, summary: string }.
 */
export async function runWithLangfuse(langfuse, callTool, query) {
  const trace = langfuse.trace({
    name: "corpus-scout-smoke",
    tags: ["smoke", "corpus-scout"],
    input: { query },
  })

  const wrappedCallTool = async (toolName, args) => {
    const span = trace.span({ name: toolName, input: args })
    try {
      const result = await callTool(toolName, args)
      span.end({ output: result })
      return result
    } catch (err) {
      span.update({ level: "ERROR" })
      throw err
    }
  }

  try {
    const result = await runSmoke(wrappedCallTool, query)
    const summary = `${result.matchCount} matches, ${result.lineCount} lines`
    trace.update({ output: `PASS: ${summary}`, level: "DEFAULT" })
    return { pass: true, summary }
  } catch (err) {
    trace.update({ output: `FAIL: ${err.message}`, level: "ERROR" })
    return { pass: false, summary: err.message }
  } finally {
    await langfuse.flushAsync()
  }
}

// Main — only runs when this file is the entry point, not when imported as a module
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.env.CORPUS_ROOT
  if (!root) {
    console.error("CORPUS_ROOT is required")
    process.exit(1)
  }

  const query = process.env.SMOKE_QUERY || "the"
  const langfuseClient = makeLangfuseClient(process.env)
  if (!langfuseClient) {
    console.error("FAIL: LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required")
    process.exit(1)
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: [new URL("../src/index.js", import.meta.url).pathname],
    env: { ...process.env, CORPUS_ROOT: root },
  })
  const mcpClient = new Client({ name: "smoke-test", version: "0.0.1" })

  try {
    await mcpClient.connect(transport)
    const callTool = (toolName, args) => mcpClient.callTool({ name: toolName, arguments: args })
    const result = await runWithLangfuse(langfuseClient, callTool, query)
    if (result.pass) {
      console.log(`\nPASS: ${result.summary}`)
      await mcpClient.close()
    } else {
      console.error(`\nFAIL: ${result.summary}`)
      try { await mcpClient.close() } catch {}
      process.exit(1)
    }
  } catch (err) {
    console.error(`\nFAIL: ${err.message}`)
    try { await mcpClient.close() } catch {}
    process.exit(1)
  }
}
