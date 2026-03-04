import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = resolve(__dirname, "../../src/index.js")

export function makeAdapter(corpusRoot) {
  let client

  return {
    async connect() {
      const transport = new StdioClientTransport({
        command: "node",
        args: [INDEX_PATH],
        env: { ...process.env, CORPUS_ROOT: corpusRoot, LOG_LEVEL: "silent" }
      })
      client = new Client({ name: "eval-runner", version: "0.0.1" })
      await client.connect(transport)
    },

    async close() {
      if (client) await client.close()
    },

    async query(queryString) {
      const keywords = extractKeywords(queryString)
      if (keywords.length === 0) {
        return { files: [], headings: [], text: "" }
      }

      const searchPattern = keywords.map(($0) => escapeRegex($0)).join("|")
      const searchResult = await client.callTool({
        name: "search",
        arguments: { query: searchPattern }
      })
      if (searchResult.isError) {
        return { files: [], headings: [], text: "" }
      }

      const matches = JSON.parse(searchResult.content[0].text)
      if (!Array.isArray(matches) || matches.length === 0) {
        return { files: [], headings: [], text: "" }
      }

      const fileKeywordHits = new Map()
      const lowerKeywords = keywords.map(($0) => $0.toLowerCase())
      for (const match of matches) {
        if (!fileKeywordHits.has(match.file)) fileKeywordHits.set(match.file, new Set())
        const hitSet = fileKeywordHits.get(match.file)
        const matchText = match.text.toLowerCase()
        for (const kw of lowerKeywords) {
          if (matchText.includes(kw)) hitSet.add(kw)
        }
      }
      const rankedFiles = [...fileKeywordHits.entries()]
        .map(([file, hits]) => [file, hits.size])
        .sort((a, b) => b[1] - a[1])
      const topScore = rankedFiles[0][1]
      const uniqueFiles = rankedFiles
        .filter(($0) => $0[1] === topScore)
        .map(($0) => $0[0])
      const allHeadings = []
      const allTexts = []

      for (const file of uniqueFiles) {
        const fullFileResult = await client.callTool({
          name: "read_section",
          arguments: { file }
        })
        if (fullFileResult.isError) continue

        const fullFile = JSON.parse(fullFileResult.content[0].text)
        const fileLines = fullFile.content.split("\n")
        const fileMatches = matches.filter(($0) => $0.file === file)

        const headingsForFile = new Set()
        for (const match of fileMatches) {
          const heading = findHeadingForLine(fileLines, match.line)
          if (heading) headingsForFile.add(heading)
        }

        for (const heading of headingsForFile) {
          if (allHeadings.includes(heading)) continue
          const sectionResult = await client.callTool({
            name: "read_section",
            arguments: { file, heading }
          })
          if (!sectionResult.isError) {
            const section = JSON.parse(sectionResult.content[0].text)
            allHeadings.push(heading)
            allTexts.push(section.content)
          }
        }
      }

      return {
        files: uniqueFiles,
        headings: allHeadings,
        text: allTexts.join("\n")
      }
    }
  }
}

function findHeadingForLine(lines, lineNumber) {
  for (let i = lineNumber - 1; i >= 0; i--) {
    const m = lines[i].match(/^#{1,6}\s+(.+)$/)
    if (m) return m[1].trim()
  }
  return null
}

const STOP_WORDS = new Set([
  "и", "в", "на", "с", "к", "по", "из", "от", "за", "о", "об", "до",
  "не", "ни", "ли", "бы", "же", "то", "что", "как", "кто", "где",
  "когда", "чем", "для", "при", "это", "его", "её", "их", "мы", "вы",
  "он", "она", "оно", "они", "я", "ты", "все", "всё", "уже", "ещё",
  "или", "а", "но", "да", "нет", "был", "была", "было", "были",
  "есть", "быть", "будет", "можно", "какой", "какая", "какое", "какие",
  "чему", "кого", "чего", "кому", "чему", "чей", "чья", "чьё",
  "the", "a", "an", "is", "was", "of", "in", "to", "and", "or", "for"
])

function extractKeywords(query) {
  return query
    .replace(/[«»""„?!.,;:()—–\-\[\]{}]/g, " ")
    .split(/\s+/)
    .filter(($0) => $0.length >= 3 && !STOP_WORDS.has($0.toLowerCase()))
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
