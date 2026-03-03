import test from "node:test"
import assert from "node:assert/strict"
import { runSmoke, runWithLangfuse, makeLangfuseClient } from "../scripts/smoke.js"

// --- Helpers ---

function makeMockCallTool({ searchError, sectionError, matchCount = 2 } = {}) {
  const matches = Array.from({ length: matchCount }, (_, i) => ({
    file: `doc${i}.md`,
    line: i + 1,
    text: `line content ${i}`,
  }))
  return async (toolName, args) => {
    if (toolName === "search") {
      if (searchError) return { isError: true, content: [{ text: searchError }] }
      return { isError: false, content: [{ text: JSON.stringify(matches) }] }
    }
    if (toolName === "read_section") {
      if (sectionError) return { isError: true, content: [{ text: sectionError }] }
      return {
        isError: false,
        content: [{ text: JSON.stringify({ content: "hello world", startLine: 1, endLine: 5, truncated: false }) }],
      }
    }
    throw new Error(`unknown tool: ${toolName}`)
  }
}

function makeMockLangfuse() {
  const span = { end: () => {}, update: () => {} }
  const trace = { span: () => span, update: () => {} }
  const langfuse = { trace: () => trace, flushAsync: async () => {} }
  return { langfuse, trace }
}

// --- makeLangfuseClient ---

await test("makeLangfuseClient_noKeys_returnsNull", () => {
  assert.equal(makeLangfuseClient({}), null)
})

await test("makeLangfuseClient_onlySecretKey_returnsNull", () => {
  assert.equal(makeLangfuseClient({ LANGFUSE_SECRET_KEY: "sk" }), null)
})

await test("makeLangfuseClient_onlyPublicKey_returnsNull", () => {
  assert.equal(makeLangfuseClient({ LANGFUSE_PUBLIC_KEY: "pk" }), null)
})

await test("makeLangfuseClient_keysPresent_constructsClientWithCorrectOpts", () => {
  const instances = []
  class MockLangfuse {
    constructor(opts) { instances.push(opts) }
  }
  const env = {
    LANGFUSE_SECRET_KEY: "sk-test",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_BASE_URL: "http://langfuse:3000",
  }
  makeLangfuseClient(env, MockLangfuse)
  assert.equal(instances.length, 1)
  assert.deepEqual(instances[0], { secretKey: "sk-test", publicKey: "pk-test", baseUrl: "http://langfuse:3000" })
})

await test("makeLangfuseClient_noBaseUrl_omitsBaseUrl", () => {
  const instances = []
  class MockLangfuse {
    constructor(opts) { instances.push(opts) }
  }
  makeLangfuseClient({ LANGFUSE_SECRET_KEY: "sk", LANGFUSE_PUBLIC_KEY: "pk" }, MockLangfuse)
  assert.equal(instances[0].baseUrl, undefined)
})

// --- runSmoke ---

await test("runSmoke_searchError_throws", async () => {
  await assert.rejects(
    () => runSmoke(makeMockCallTool({ searchError: "corpus unavailable" }), "test"),
    /search failed: corpus unavailable/,
  )
})

await test("runSmoke_emptyResults_throws", async () => {
  await assert.rejects(
    () => runSmoke(makeMockCallTool({ matchCount: 0 }), "test"),
    /zero matches/,
  )
})

await test("runSmoke_sectionError_throws", async () => {
  await assert.rejects(
    () => runSmoke(makeMockCallTool({ sectionError: "file not found" }), "test"),
    /read_section failed: file not found/,
  )
})

await test("runSmoke_success_returnsMatchAndLineCount", async () => {
  const result = await runSmoke(makeMockCallTool({ matchCount: 3 }), "test")
  assert.equal(result.matchCount, 3)
  assert.equal(result.lineCount, 5)
  assert.equal(result.truncated, false)
  assert.equal(result.firstFile, "doc0.md")
})

// --- runWithLangfuse ---

await test("runWithLangfuse_createsTrace_withCorpusScoutTag", async () => {
  const { langfuse, trace } = makeMockLangfuse()
  let traceArgs
  langfuse.trace = (args) => { traceArgs = args; return trace }

  await runWithLangfuse(langfuse, makeMockCallTool(), "my query")

  assert.equal(traceArgs.name, "corpus-scout-smoke")
  assert.deepEqual(traceArgs.tags, ["smoke", "corpus-scout"])
  assert.deepEqual(traceArgs.input, { query: "my query" })
})

await test("runWithLangfuse_createsSpan_perToolCall", async () => {
  const { langfuse, trace } = makeMockLangfuse()
  const spanArgs = []
  trace.span = (args) => { spanArgs.push(args); return { end: () => {}, update: () => {} } }

  await runWithLangfuse(langfuse, makeMockCallTool(), "test")

  assert.equal(spanArgs.length, 2)
  assert.equal(spanArgs[0].name, "search")
  assert.deepEqual(spanArgs[0].input, { query: "test" })
  assert.equal(spanArgs[1].name, "read_section")
  assert.equal(spanArgs[1].input.file, "doc0.md")
})

await test("runWithLangfuse_success_updatesTraceToDefaultLevel", async () => {
  const { langfuse, trace } = makeMockLangfuse()
  const updates = []
  trace.update = (args) => updates.push(args)

  await runWithLangfuse(langfuse, makeMockCallTool(), "test")

  assert.ok(updates.some((u) => u.level === "DEFAULT"), "expected DEFAULT level update")
})

await test("runWithLangfuse_failure_updatesTraceToErrorLevel", async () => {
  const { langfuse, trace } = makeMockLangfuse()
  const updates = []
  trace.update = (args) => updates.push(args)

  await runWithLangfuse(langfuse, makeMockCallTool({ searchError: "err" }), "test")

  assert.ok(updates.some((u) => u.level === "ERROR"), "expected ERROR level update")
})

await test("runWithLangfuse_success_returnsPassTrue", async () => {
  const { langfuse } = makeMockLangfuse()
  const result = await runWithLangfuse(langfuse, makeMockCallTool(), "test")
  assert.equal(result.pass, true)
})

await test("runWithLangfuse_failure_returnsPassFalse", async () => {
  const { langfuse } = makeMockLangfuse()
  const result = await runWithLangfuse(langfuse, makeMockCallTool({ searchError: "err" }), "test")
  assert.equal(result.pass, false)
})

await test("runWithLangfuse_flushes_onSuccess", async () => {
  const { langfuse } = makeMockLangfuse()
  let flushed = false
  langfuse.flushAsync = async () => { flushed = true }

  await runWithLangfuse(langfuse, makeMockCallTool(), "test")
  assert.equal(flushed, true)
})

await test("runWithLangfuse_flushes_onFailure", async () => {
  const { langfuse } = makeMockLangfuse()
  let flushed = false
  langfuse.flushAsync = async () => { flushed = true }

  await runWithLangfuse(langfuse, makeMockCallTool({ searchError: "err" }), "test")
  assert.equal(flushed, true)
})
