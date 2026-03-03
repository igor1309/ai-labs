import { execFile } from "node:child_process"
import { relative } from "node:path"

const DEFAULT_GLOB = "**/*.md"
const DEFAULT_MAX_RESULTS = 20
const DEFAULT_MAX_LINES = 200

/** @param {{ root: string, glob?: string, maxResults?: number, maxLines?: number }} options */
export function makeCorpusClient({ root, glob = DEFAULT_GLOB, maxResults = DEFAULT_MAX_RESULTS, maxLines = DEFAULT_MAX_LINES }) {
  return {
    async search(query, options) {
      if (!query || !query.trim()) {
        throw new Error("Empty query")
      }

      const effectiveGlob = options?.fileGlob ?? glob
      const args = [
        "--json",
        "--no-messages",
        "-C", "1",
        "--glob", effectiveGlob,
        "-m", String(maxResults)
      ]
      if (!options?.caseSensitive) {
        args.push("-i")
      }
      args.push("--", query, root)

      const stdout = await runRg(args)
      if (stdout === null) return []

      return parseRgJson(stdout, root).slice(0, maxResults)
    }
  }
}

function runRg(args) {
  return new Promise((resolve, reject) => {
    execFile("rg", args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err && err.code === 1) return resolve(null)
      if (err) return reject(err)
      resolve(stdout)
    })
  })
}

function parseRgJson(stdout, root) {
  const lines = stdout.trim().split("\n").filter(Boolean)
  const entries = lines.map(($0) => JSON.parse($0)).filter(($0) => $0.type === "match" || $0.type === "context")
  const matches = []

  for (let i = 0; i < entries.length; i++) {
    const msg = entries[i]
    if (msg.type !== "match") continue

    const absPath = msg.data.path.text
    const file = relative(root, absPath)
    const lineNo = msg.data.line_number
    const text = msg.data.lines.text.replace(/\n$/, "")
    const before = []
    const after = []

    for (let j = i - 1; j >= 0; j--) {
      const prev = entries[j]
      if (prev.type !== "context") break
      if (prev.data.path.text !== absPath) break
      before.unshift(prev.data.lines.text.replace(/\n$/, ""))
    }

    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j]
      if (next.type !== "context") break
      if (next.data.path.text !== absPath) break
      after.push(next.data.lines.text.replace(/\n$/, ""))
    }

    matches.push({ file, line: lineNo, text, before, after })
  }

  return matches
}
