#!/usr/bin/env node

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { makeAdapter } from "./adapter.js"
import { loadGold, runEval } from "./eval.js"
import { buildReport, writeReport, exitCode } from "./reporter.js"
import { verifyGold } from "./verify-gold.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const GOLD_PATH = resolve(__dirname, "gold.yaml")
const CORPUS_ROOT = resolve(__dirname, "corpus")
const REPORT_PATH = resolve(__dirname, "report.json")

async function main() {
  const gold = await loadGold(GOLD_PATH)

  process.stdout.write("Verifying gold dataset integrity...\n")
  const goldErrors = await verifyGold(gold, CORPUS_ROOT)
  if (goldErrors.length > 0) {
    process.stderr.write("Gold dataset integrity check failed:\n")
    for (const err of goldErrors) {
      process.stderr.write(`  ${err}\n`)
    }
    process.exit(2)
  }
  process.stdout.write("Gold dataset OK\n")

  const adapter = makeAdapter(CORPUS_ROOT)
  try {
    await adapter.connect()

    process.stdout.write(`Running ${gold.cases.length} eval cases...\n`)
    const results = await runEval(gold, adapter)
    const report = buildReport(results)
    await writeReport(report, REPORT_PATH)

    const passed = results.filter(($0) => $0.ok).length
    const failed = results.filter(($0) => !$0.ok).length
    process.stdout.write(`\nResults: ${passed} passed, ${failed} failed out of ${results.length}\n`)

    if (failed > 0) {
      process.stdout.write("Failed cases:\n")
      for (const r of results.filter(($0) => !$0.ok)) {
        process.stdout.write(`  ${r.id}: file_match=${r.checks.file_match} heading_match=${r.checks.heading_match} must_contain=${r.checks.must_contain_ok} extra_files=${r.checks.extra_files}\n`)
      }
    }

    process.stdout.write(`Report written to ${REPORT_PATH}\n`)
    await adapter.close()
    process.exit(exitCode(report))
  } catch (err) {
    process.stderr.write(`Fatal: ${err.message}\n`)
    try { await adapter.close() } catch {}
    process.exit(2)
  }
}

main()
