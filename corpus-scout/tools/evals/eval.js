import { readFile } from "node:fs/promises"
import yaml from "js-yaml"

export async function loadGold(goldPath) {
  const raw = await readFile(goldPath, "utf-8")
  return yaml.load(raw)
}

export async function runEval(gold, adapter) {
  const results = []

  for (const testCase of gold.cases) {
    const startMs = Date.now()
    const got = await adapter.query(testCase.query)
    const latencyMs = Date.now() - startMs

    const expected = testCase.expected
    const isEmptyExpected = expected.max_files === 0

    let fileMatch, headingMatch, mustContainOk, extraFiles

    if (isEmptyExpected) {
      fileMatch = got.files.length === 0
      headingMatch = got.headings.length === 0
      mustContainOk = true
      extraFiles = got.files.length
    } else {
      fileMatch = got.files.includes(expected.file)
      headingMatch = got.headings.includes(expected.heading)
      mustContainOk = (expected.must_contain || []).every(($0) =>
        got.text.includes($0)
      )
      extraFiles = Math.max(0, got.files.length - expected.max_files)
    }

    const ncfb = isEmptyExpected
      ? got.files.length === 0
      : got.files.length <= expected.max_files

    const ok = fileMatch && headingMatch && ncfb && mustContainOk

    results.push({
      id: testCase.id,
      ok,
      expected: {
        file: expected.file,
        heading: expected.heading
      },
      got: {
        files: got.files,
        headings: got.headings
      },
      checks: {
        file_match: fileMatch,
        heading_match: headingMatch,
        must_contain_ok: mustContainOk,
        extra_files: extraFiles
      },
      latency_ms: latencyMs
    })
  }

  return results
}
