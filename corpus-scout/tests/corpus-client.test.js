import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { tmpdir } from "node:os"
import { makeCorpusClient } from "../src/corpus-client.js"

async function makeTempCorpus(files) {
  const root = await mkdtemp(join(tmpdir(), "corpus-"))
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
  return root
}

test("search_shouldReturnMatches_withFileAndLine", async () => {
  const root = await makeTempCorpus({
    "doc.md": "line one\nthe dragon sleeps\nline three\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    assert.equal(results.length, 1)
    assert.equal(results[0].file, "doc.md")
    assert.equal(results[0].line, 2)
    assert.equal(results[0].text, "the dragon sleeps")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldContainQueryToken_inMatchText", async () => {
  const root = await makeTempCorpus({
    "doc.md": "the dragon sleeps\nno match here\ndragon flies\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    assert.ok(results.length > 0, "expected at least one result")
    assert.ok(
      results.every(($0) => $0.text.toLowerCase().includes("dragon")),
      `expected all results to contain query token, got: ${results.map(($0) => $0.text)}`
    )
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldReturnEmptyArray_onNoMatch", async () => {
  const root = await makeTempCorpus({
    "doc.md": "nothing interesting here\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("unicorn")
    assert.deepEqual(results, [])
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldRespectMaxResults", async () => {
  const root = await makeTempCorpus({
    "doc.md": "match one\nmatch two\nmatch three\nmatch four\nmatch five\n"
  })
  try {
    const client = makeCorpusClient({ root, maxResults: 2 })
    const results = await client.search("match")
    assert.equal(results.length, 2)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldBeCaseInsensitive_byDefault", async () => {
  const root = await makeTempCorpus({
    "doc.md": "THE DRAGON ROARS\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    assert.equal(results.length, 1)
    assert.equal(results[0].text, "THE DRAGON ROARS")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldBeCaseSensitive_whenRequested", async () => {
  const root = await makeTempCorpus({
    "doc.md": "THE DRAGON ROARS\nthe dragon whispers\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon", { caseSensitive: true })
    assert.equal(results.length, 1)
    assert.equal(results[0].text, "the dragon whispers")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldFilterByFileGlob_whenProvided", async () => {
  const root = await makeTempCorpus({
    "doc.md": "the dragon is here\n",
    "doc.txt": "the dragon is also here\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon", { fileGlob: "*.txt" })
    assert.equal(results.length, 1)
    assert.equal(results[0].file, "doc.txt")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldIncludeContextLines", async () => {
  const root = await makeTempCorpus({
    "doc.md": "before line\nthe dragon sleeps\nafter line\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    assert.equal(results.length, 1)
    assert.deepEqual(results[0].before, ["before line"])
    assert.deepEqual(results[0].after, ["after line"])
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldReturnRelativePaths", async () => {
  const root = await makeTempCorpus({
    "sub/dir/nested.md": "the dragon hides deep\n"
  })
  try {
    const client = makeCorpusClient({ root })
    const results = await client.search("dragon")
    assert.equal(results.length, 1)
    assert.equal(results[0].file, "sub/dir/nested.md")
  } finally {
    await rm(root, { recursive: true })
  }
})

test("search_shouldThrow_onEmptyQuery", async () => {
  const root = await makeTempCorpus({
    "doc.md": "content\n"
  })
  try {
    const client = makeCorpusClient({ root })
    await assert.rejects(() => client.search(""), { message: /empty query/i })
    await assert.rejects(() => client.search("   "), { message: /empty query/i })
  } finally {
    await rm(root, { recursive: true })
  }
})

const sampleDoc = `# Title
Intro paragraph.

## Characters
Alice is the protagonist.
Bob is the antagonist.

## Plot
The story begins at dawn.

### Act One
First act details.

## Ending
They reconcile.
`

test("readSection_shouldReturnFullFile_whenNoHeadingOrRange", async () => {
  const root = await makeTempCorpus({ "doc.md": "line one\nline two\nline three\n" })
  try {
    const client = makeCorpusClient({ root })
    const result = await client.readSection({ file: "doc.md" })
    assert.equal(result.file, "doc.md")
    assert.equal(result.content, "line one\nline two\nline three\n")
    assert.equal(result.startLine, 1)
    assert.equal(result.endLine, 3)
    assert.equal(result.truncated, false)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldReturnHeadingSection_whenHeadingProvided", async () => {
  const root = await makeTempCorpus({ "doc.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root })
    const result = await client.readSection({ file: "doc.md", heading: "Characters" })
    assert.ok(result.content.includes("Alice is the protagonist."))
    assert.ok(result.content.includes("Bob is the antagonist."))
    assert.ok(!result.content.includes("The story begins at dawn."))
    assert.equal(result.truncated, false)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldIncludeSubheadings_inSection", async () => {
  const root = await makeTempCorpus({ "doc.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root })
    const result = await client.readSection({ file: "doc.md", heading: "Plot" })
    assert.ok(result.content.includes("The story begins at dawn."))
    assert.ok(result.content.includes("### Act One"))
    assert.ok(result.content.includes("First act details."))
    assert.ok(!result.content.includes("They reconcile."))
    assert.equal(result.truncated, false)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldReturnLineRange_whenStartAndEndProvided", async () => {
  const root = await makeTempCorpus({ "doc.md": "line1\nline2\nline3\nline4\nline5\n" })
  try {
    const client = makeCorpusClient({ root })
    const result = await client.readSection({ file: "doc.md", startLine: 2, endLine: 4 })
    assert.equal(result.content, "line2\nline3\nline4")
    assert.equal(result.startLine, 2)
    assert.equal(result.endLine, 4)
    assert.equal(result.truncated, false)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldTruncate_whenExceedingMaxLines", async () => {
  const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n") + "\n"
  const root = await makeTempCorpus({ "doc.md": lines })
  try {
    const client = makeCorpusClient({ root, maxLines: 10 })
    const result = await client.readSection({ file: "doc.md" })
    assert.equal(result.content.split("\n").length, 10)
    assert.equal(result.truncated, true)
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldThrow_onDirectoryTraversal", async () => {
  const root = await makeTempCorpus({ "doc.md": "content\n" })
  try {
    const client = makeCorpusClient({ root })
    await assert.rejects(
      () => client.readSection({ file: "../../../etc/passwd" }),
      { message: /outside corpus/i }
    )
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldThrow_onMissingFile", async () => {
  const root = await makeTempCorpus({ "doc.md": "content\n" })
  try {
    const client = makeCorpusClient({ root })
    await assert.rejects(
      () => client.readSection({ file: "nonexistent.md" }),
      { code: "ENOENT" }
    )
  } finally {
    await rm(root, { recursive: true })
  }
})

test("readSection_shouldThrow_onHeadingNotFound", async () => {
  const root = await makeTempCorpus({ "doc.md": sampleDoc })
  try {
    const client = makeCorpusClient({ root })
    await assert.rejects(
      () => client.readSection({ file: "doc.md", heading: "Nonexistent" }),
      { message: /heading.*not found/i }
    )
  } finally {
    await rm(root, { recursive: true })
  }
})
