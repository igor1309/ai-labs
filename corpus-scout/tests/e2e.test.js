import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

// Helpers

async function makeTempCorpus(files) {
  const root = await mkdtemp(join(tmpdir(), "corpus-e2e-"))
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
  return root
}

async function makeE2eClient(corpusRoot) {
  const indexPath = new URL("../src/index.js", import.meta.url).pathname
  const transport = new StdioClientTransport({
    command: "node",
    args: [indexPath],
    env: { ...process.env, CORPUS_ROOT: corpusRoot }
  })
  const client = new Client({ name: "e2e-test", version: "0.0.1" })
  await client.connect(transport)
  return client
}

// Tests

test("e2e_shouldReturnSearchResults_viaStdioTransport", async () => {
  const root = await makeTempCorpus({
    "characters/hero.md": "# Hero\nThe brave knight ventures forth.\n",
    "plot/act1.md": "# Act One\nThe knight meets the dragon.\n"
  })
  try {
    const client = await makeE2eClient(root)
    const result = await client.callTool({ name: "search", arguments: { query: "knight" } })
    await client.close()

    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text)
    assert.equal(parsed.length, 2)
    assert.deepEqual(parsed.map(($0) => $0.file).sort(), ["characters/hero.md", "plot/act1.md"])
  } finally {
    await rm(root, { recursive: true })
  }
})

test("e2e_shouldReturnSection_viaStdioTransport", async () => {
  const root = await makeTempCorpus({
    "story.md": "# Title\nIntro.\n\n## Chapter One\nThe story begins.\n\n## Chapter Two\nIt continues.\n"
  })
  try {
    const client = await makeE2eClient(root)
    const result = await client.callTool({ name: "read_section", arguments: { file: "story.md", heading: "Chapter One" } })
    await client.close()

    assert.equal(result.isError, undefined)
    const parsed = JSON.parse(result.content[0].text)
    assert.match(parsed.content, /story begins/)
    assert.ok(!parsed.content.includes("Chapter Two"))
  } finally {
    await rm(root, { recursive: true })
  }
})
