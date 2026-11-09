// Measures the whole rexlab suite for the weekly slow-test hunt: runs it
// three times with Vitest's JSON reporter and writes every test, ranked by
// its median duration, to slow-tests-report.json and .md in the current
// directory. Deterministic and token-free; a failing test does not stop
// the measurement.
//
//   npx tsx scripts/slow-tests.ts [runs]
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { markdown, parseSkipList, rank, type Sample } from "./slowTestsReport.ts";

const project = join(import.meta.dirname, "..");
const runs = Number(process.argv[2] ?? 3);
const skipFile = join(import.meta.dirname, "slow-tests.skip");
const skip = parseSkipList(existsSync(skipFile) ? readFileSync(skipFile, "utf8") : "");
const scratch = mkdtempSync(join(tmpdir(), "rexlab-slow-tests-"));

type VitestJson = { testResults: { name: string; assertionResults: { fullName: string; duration?: number | null; status: string; location?: { line: number } }[] }[] };

const samples: Sample[][] = [];
for (let run = 1; run <= runs; run++) {
  const output = join(scratch, `run-${run}.json`);
  console.error(`run ${run} of ${runs}`);
  spawnSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${output}`, "--includeTaskLocation"], { cwd: project, stdio: ["ignore", "ignore", "inherit"] });
  if (!existsSync(output)) throw new Error(`run ${run} wrote no report`);
  const report = JSON.parse(readFileSync(output, "utf8")) as VitestJson;
  samples.push(report.testResults.flatMap((file) => {
    const path = relative(project, file.name);
    return file.assertionResults
      .filter((test) => test.status === "passed" || test.status === "failed")
      .map((test) => ({ id: `${path} > ${test.fullName}`, file: `rexlab/${path}`, line: test.location?.line, durationMs: test.duration ?? 0 }));
  }));
}

const report = rank("rexlab", samples, skip, new Date().toISOString());
writeFileSync("slow-tests-report.json", `${JSON.stringify(report, null, 2)}\n`);
writeFileSync("slow-tests-report.md", markdown(report));
console.error(`ranked ${report.tests.length} tests`);
