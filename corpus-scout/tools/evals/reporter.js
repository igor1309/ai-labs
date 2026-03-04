import { writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"

export function buildReport(results) {
  const casesTotal = results.length
  const casesFailed = results.filter(($0) => !$0.ok).length

  let corpusCommit = "fixture"
  try {
    corpusCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8"
    }).trim()
  } catch {}

  return {
    run_id: new Date().toISOString(),
    corpus_commit: corpusCommit,
    cases_total: casesTotal,
    cases_failed: casesFailed,
    cases: results
  }
}

export async function writeReport(report, outputPath) {
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n")
}

export function exitCode(report) {
  return report.cases_failed > 0 ? 1 : 0
}
