import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export async function verifyGold(gold, corpusRoot) {
  const errors = []

  for (const testCase of gold.cases) {
    const expected = testCase.expected
    if (expected.max_files === 0) continue
    if (!expected.must_contain || expected.must_contain.length === 0) continue

    const filePath = resolve(corpusRoot, expected.file)
    let content
    try {
      content = await readFile(filePath, "utf-8")
    } catch {
      errors.push(`${testCase.id}: file not found: ${expected.file}`)
      continue
    }

    const lines = content.split("\n")
    const sectionText = extractSection(lines, expected.heading)
    if (sectionText === null) {
      errors.push(`${testCase.id}: heading not found: "${expected.heading}" in ${expected.file}`)
      continue
    }

    for (const token of expected.must_contain) {
      if (!sectionText.includes(token)) {
        errors.push(`${testCase.id}: token not found in section "${expected.heading}": "${token}"`)
      }
    }
  }

  return errors
}

function extractSection(lines, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapedHeading}\\s*$`)
  let matchIndex = -1
  let matchLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingPattern)
    if (m) {
      matchIndex = i
      matchLevel = m[1].length
      break
    }
  }

  if (matchIndex === -1) return null

  let endIndex = lines.length
  for (let i = matchIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/)
    if (m && m[1].length <= matchLevel) {
      endIndex = i
      break
    }
  }

  return lines.slice(matchIndex, endIndex).join("\n")
}
